import { API_BASE_URL } from '@/lib/env';
import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { DatabaseType } from '@/lib/domain/database-type';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';
export type ServerDiagram = Diagram & { revision: number };
export const BACKEND_UNAVAILABLE_EVENT = 'chartdb-backend-unavailable';

const reportBackendUnavailable = () =>
    window.dispatchEvent(new Event(BACKEND_UNAVAILABLE_EVENT));

export class ChartDBAPIError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
    }
}

const parseDiagram = (value: Record<string, unknown>): ServerDiagram => ({
    ...(value as unknown as ServerDiagram),
    createdAt: new Date(value.createdAt as string),
    updatedAt: new Date(value.updatedAt as string),
});

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...init?.headers },
        });
    } catch (error) {
        reportBackendUnavailable();
        throw new ChartDBAPIError(
            0,
            'network_error',
            'Cannot connect to the ChartDB backend.',
            error
        );
    }
    if (!response.ok) {
        if (response.status >= 500) reportBackendUnavailable();
        const body = await response.json().catch(() => ({}));
        throw new ChartDBAPIError(
            response.status,
            body.code ?? 'api_error',
            body.message ?? `Request failed (${response.status})`,
            body.details
        );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
};

export const listServerDiagrams = async (): Promise<ServerDiagram[]> =>
    (await request<Record<string, unknown>[]>('/diagrams')).map(parseDiagram);

export const getServerDiagram = async (id: string): Promise<ServerDiagram> =>
    parseDiagram(
        await request<Record<string, unknown>>(
            `/diagrams/${encodeURIComponent(id)}`
        )
    );

export const createServerDiagram = async (
    diagram: Diagram
): Promise<ServerDiagram> =>
    parseDiagram(
        await request<Record<string, unknown>>('/diagrams', {
            method: 'POST',
            body: JSON.stringify({ ...diagram, revision: undefined }),
        })
    );

export const saveServerDiagram = async (
    diagram: ServerDiagram
): Promise<ServerDiagram> =>
    parseDiagram(
        await request<Record<string, unknown>>(
            `/diagrams/${encodeURIComponent(diagram.id)}`,
            { method: 'PUT', body: JSON.stringify(diagram) }
        )
    );

export const deleteServerDiagram = async (
    id: string,
    revision: number
): Promise<void> =>
    request(`/diagrams/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision }),
    });

export const introspectSourceDatabase = (): Promise<DatabaseMetadata> =>
    request('/source-database/introspect', { method: 'POST', body: '{}' });

export const streamAIExport = async ({
    sqlScript,
    targetDatabaseType,
    signal,
    onDelta,
}: {
    sqlScript: string;
    targetDatabaseType: DatabaseType;
    signal?: AbortSignal;
    onDelta: (text: string) => void;
}): Promise<string> => {
    let response: Response;
    try {
        response = await fetch(`${API_BASE_URL}/ai/sql-export/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
            },
            body: JSON.stringify({ sqlScript, targetDatabaseType }),
            signal,
        });
    } catch (error) {
        reportBackendUnavailable();
        throw error;
    }
    if (!response.ok || !response.body) {
        if (response.status >= 500) reportBackendUnavailable();
        const body = await response.json().catch(() => ({}));
        throw new ChartDBAPIError(
            response.status,
            body.code ?? 'ai_error',
            body.message ?? 'AI export failed.'
        );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
            const event = block.match(/^event: (.+)$/m)?.[1];
            const rawData = block.match(/^data: (.+)$/m)?.[1];
            if (!rawData) continue;
            const payload = JSON.parse(rawData);
            if (event === 'delta') {
                result += payload.text;
                onDelta(payload.text);
            } else if (event === 'error') {
                throw new ChartDBAPIError(502, payload.code, payload.message);
            }
        }
        if (done) break;
    }
    return result;
};
