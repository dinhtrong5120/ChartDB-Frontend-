import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import type { Diagram } from '@/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listServerDiagrams } from '@/lib/api/chartdb-api';
import { createServerDiagram } from '@/lib/api/chartdb-api';
import { useStorage } from '@/hooks/use-storage';

const LEGACY_MIGRATION_KEY = 'chartdb-server-migration-v1';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId } = useParams<{ diagramId: string }>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const storage = useStorage();
    const [migrationChecked, setMigrationChecked] = useState(false);

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        const migrateLegacyDiagrams = async () => {
            if (localStorage.getItem(LEGACY_MIGRATION_KEY) === 'done') {
                if (!cancelled) setMigrationChecked(true);
                return;
            }
            try {
                const [serverDiagrams, localDiagrams] = await Promise.all([
                    listServerDiagrams(),
                    storage.listDiagrams({
                        includeTables: true,
                        includeRelationships: true,
                        includeDependencies: true,
                        includeAreas: true,
                        includeCustomTypes: true,
                        includeNotes: true,
                    }),
                ]);
                const serverIds = new Set(serverDiagrams.map(({ id }) => id));
                const legacy = localDiagrams.filter(
                    ({ id }) => !serverIds.has(id)
                );
                if (
                    legacy.length > 0 &&
                    window.confirm(
                        `${legacy.length} local diagram(s) were found. Import them into the backend now?`
                    )
                ) {
                    const results = await Promise.allSettled(
                        legacy.map((diagram) => createServerDiagram(diagram))
                    );
                    const failed = results.filter(
                        ({ status }) => status === 'rejected'
                    ).length;
                    if (failed > 0) {
                        window.alert(
                            `${failed} diagram(s) could not be imported. They remain in IndexedDB and migration will be offered again.`
                        );
                    } else {
                        localStorage.setItem(LEGACY_MIGRATION_KEY, 'done');
                    }
                } else {
                    localStorage.setItem(LEGACY_MIGRATION_KEY, 'done');
                }
                if (!cancelled) setMigrationChecked(true);
            } catch (error) {
                console.error('ChartDB backend is unavailable', error);
                if (!cancelled) setMigrationChecked(true);
            }
        };
        migrateLegacyDiagrams();
        return () => {
            cancelled = true;
        };
    }, [storage]);

    useEffect(() => {
        if (!config || !migrationChecked) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            if (diagramId) {
                setInitialDiagram(undefined);
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(diagramId);
                if (!diagram) {
                    openOpenDiagramDialog({ canClose: false });
                    hideLoader();
                    return;
                }

                setInitialDiagram(diagram);
                hideLoader();

                return;
            } else if (!diagramId && config.defaultDiagramId) {
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    navigate(`/diagrams/${config.defaultDiagramId}`);

                    return;
                }
            }
            const diagrams = await listServerDiagrams();

            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                openCreateDiagramDialog();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram().catch((error) => {
            console.error('ChartDB backend is unavailable', error);
            hideLoader();
            currentDiagramLoadingRef.current = undefined;
            window.alert(
                'Cannot connect to the ChartDB backend. Your local draft has been kept in IndexedDB.'
            );
        });
    }, [
        diagramId,
        openCreateDiagramDialog,
        config,
        navigate,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
        migrationChecked,
    ]);

    return { initialDiagram };
};
