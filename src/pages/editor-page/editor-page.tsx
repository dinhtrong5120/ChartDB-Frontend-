import React, { Suspense, useEffect } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useDialog } from '@/hooks/use-dialog';
import { Toaster } from '@/components/toast/toaster';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useLocalConfig } from '@/hooks/use-local-config';
import { FullScreenLoaderProvider } from '@/context/full-screen-spinner-context/full-screen-spinner-provider';
import { LayoutProvider } from '@/context/layout-context/layout-provider';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ConfigProvider } from '@/context/config-context/config-provider';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { HistoryProvider } from '@/context/history-context/history-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { ReactFlowProvider } from '@xyflow/react';
import { ExportImageProvider } from '@/context/export-image-context/export-image-provider';
import { DialogProvider } from '@/context/dialog-context/dialog-provider';
import { KeyboardShortcutsProvider } from '@/context/keyboard-shortcuts-context/keyboard-shortcuts-provider';
import { Spinner } from '@/components/spinner/spinner';
import { Helmet } from 'react-helmet-async';
import { AlertProvider } from '@/context/alert-context/alert-provider';
import { CanvasProvider } from '@/context/canvas-context/canvas-provider';
import { HIDE_CHARTDB_CLOUD } from '@/lib/env';
import { useDiagramLoader } from './use-diagram-loader';
import { DiffProvider } from '@/context/diff-context/diff-provider';
import { TopNavbarMock } from './top-navbar/top-navbar-mock';
import { DiagramFilterProvider } from '@/context/diagram-filter-context/diagram-filter-provider';

const OPEN_STAR_US_AFTER_SECONDS = 30;
const SHOW_STAR_US_AGAIN_AFTER_DAYS = 1;

export const EditorDesktopLayoutLazy = React.lazy(
    () => import('./editor-desktop-layout')
);

export const EditorMobileLayoutLazy = React.lazy(
    () => import('./editor-mobile-layout')
);

const EditorPageComponent: React.FC = () => {
    const { diagramName, currentDiagram } = useChartDB();
    const { openStarUsDialog } = useDialog();
    const { isMd: isDesktop } = useBreakpoint('md');
    const { starUsDialogLastOpen, setStarUsDialogLastOpen, githubRepoOpened } =
        useLocalConfig();
    const { initialDiagram, backendUnavailable } = useDiagramLoader();

    useEffect(() => {
        if (HIDE_CHARTDB_CLOUD) {
            return;
        }

        if (!currentDiagram?.id || githubRepoOpened) {
            return;
        }

        if (
            new Date().getTime() - starUsDialogLastOpen >
            1000 * 60 * 60 * 24 * SHOW_STAR_US_AGAIN_AFTER_DAYS
        ) {
            const lastOpen = new Date().getTime();
            setStarUsDialogLastOpen(lastOpen);
            setTimeout(openStarUsDialog, OPEN_STAR_US_AFTER_SECONDS * 1000);
        }
    }, [
        currentDiagram?.id,
        githubRepoOpened,
        openStarUsDialog,
        setStarUsDialogLastOpen,
        starUsDialogLastOpen,
    ]);

    if (backendUnavailable) {
        return (
            <section className="flex h-screen w-screen items-center justify-center bg-background p-6">
                <div className="max-w-lg rounded-lg border border-destructive/40 bg-card p-6 text-center shadow-sm">
                    <h1 className="text-xl font-semibold">
                        Cannot connect to ChartDB MySQL backend
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Start MySQL, verify the database credentials, then start
                        Django on port 8000. This application does not use a
                        browser database or an offline fallback.
                    </p>
                    <button
                        type="button"
                        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                        onClick={() => window.location.reload()}
                    >
                        Retry connection
                    </button>
                </div>
            </section>
        );
    }

    return (
        <>
            <Helmet>
                <title>
                    {diagramName
                        ? `ChartDB - ${diagramName} Diagram | Visualize Database Schemas`
                        : 'ChartDB - Create & Visualize Database Schema Diagrams'}
                </title>
            </Helmet>
            <section
                className={`bg-background ${isDesktop ? 'h-screen w-screen' : 'h-dvh w-dvw'} flex select-none flex-col overflow-x-hidden`}
            >
                <Suspense
                    fallback={
                        <>
                            <TopNavbarMock />
                            <div className="flex flex-1 items-center justify-center">
                                <Spinner
                                    size={isDesktop ? 'large' : 'medium'}
                                />
                            </div>
                        </>
                    }
                >
                    {isDesktop ? (
                        <EditorDesktopLayoutLazy
                            initialDiagram={initialDiagram}
                        />
                    ) : (
                        <EditorMobileLayoutLazy
                            initialDiagram={initialDiagram}
                        />
                    )}
                </Suspense>
            </section>
            <Toaster />
        </>
    );
};

export const EditorPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <FullScreenLoaderProvider>
                <LayoutProvider>
                    <StorageProvider>
                        <ConfigProvider>
                            <RedoUndoStackProvider>
                                <DiffProvider>
                                    <ChartDBProvider>
                                        <DiagramFilterProvider>
                                            <HistoryProvider>
                                                <ReactFlowProvider>
                                                    <CanvasProvider>
                                                        <ExportImageProvider>
                                                            <AlertProvider>
                                                                <DialogProvider>
                                                                    <KeyboardShortcutsProvider>
                                                                        <EditorPageComponent />
                                                                    </KeyboardShortcutsProvider>
                                                                </DialogProvider>
                                                            </AlertProvider>
                                                        </ExportImageProvider>
                                                    </CanvasProvider>
                                                </ReactFlowProvider>
                                            </HistoryProvider>
                                        </DiagramFilterProvider>
                                    </ChartDBProvider>
                                </DiffProvider>
                            </RedoUndoStackProvider>
                        </ConfigProvider>
                    </StorageProvider>
                </LayoutProvider>
            </FullScreenLoaderProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);
