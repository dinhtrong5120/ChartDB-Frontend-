import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listServerDiagrams, streamAIExport } from '../chartdb-api';
import { DatabaseType } from '@/lib/domain/database-type';

describe('ChartDB backend API client', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('maps diagram timestamps to Date instances', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify([
                        {
                            id: 'diagram-1',
                            name: 'Example',
                            databaseType: 'mysql',
                            createdAt: '2026-01-01T00:00:00Z',
                            updatedAt: '2026-01-02T00:00:00Z',
                            revision: 3,
                        },
                    ]),
                    { status: 200 }
                )
            )
        );

        const [diagram] = await listServerDiagrams();

        expect(diagram.createdAt).toBeInstanceOf(Date);
        expect(diagram.updatedAt).toBeInstanceOf(Date);
        expect(diagram.revision).toBe(3);
    });

    it('streams ordered SSE deltas', async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(
                    encoder.encode('event: delta\ndata: {"text":"SELECT "}\n\n')
                );
                controller.enqueue(
                    encoder.encode('event: delta\ndata: {"text":"1;"}\n\n')
                );
                controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
                controller.close();
            },
        });
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
        );
        const deltas: string[] = [];

        const sql = await streamAIExport({
            sqlScript: 'source',
            targetDatabaseType: DatabaseType.MYSQL,
            onDelta: (delta) => deltas.push(delta),
        });

        expect(sql).toBe('SELECT 1;');
        expect(deltas).toEqual(['SELECT ', '1;']);
    });

    it('normalizes backend errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        code: 'revision_conflict',
                        message: 'Stale revision.',
                        details: { currentRevision: 4 },
                    }),
                    { status: 409 }
                )
            )
        );

        await expect(listServerDiagrams()).rejects.toMatchObject({
            status: 409,
            code: 'revision_conflict',
        });
    });
});
