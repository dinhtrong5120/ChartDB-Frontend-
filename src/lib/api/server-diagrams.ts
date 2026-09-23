import type { StorageContext } from '@/context/storage-context/storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import {
    ChartDBAPIError,
    createServerDiagram,
    deleteServerDiagram,
    getServerDiagram,
} from './chartdb-api';

type DraftStorage = Pick<StorageContext, 'addDiagram' | 'deleteDiagram'> &
    Partial<Pick<StorageContext, 'updateDiagramFilter'>>;

export const cacheServerDiagram = async (
    storage: DraftStorage,
    diagram: Diagram
) => {
    await storage.deleteDiagram(diagram.id);
    await storage.addDiagram({ diagram });
    if (diagram.filter) {
        await storage.updateDiagramFilter?.(diagram.id, diagram.filter);
    }
};

export const createDiagramOnServer = async (
    storage: DraftStorage,
    diagram: Diagram
) => {
    const created = await createServerDiagram(diagram);
    await cacheServerDiagram(storage, created);
    return created;
};

export const replaceDiagramOnServer = async (
    storage: DraftStorage,
    diagram: Diagram
) => {
    try {
        const existing = await getServerDiagram(diagram.id);
        await deleteServerDiagram(existing.id, existing.revision);
    } catch (error) {
        if (!(error instanceof ChartDBAPIError) || error.status !== 404) {
            throw error;
        }
    }
    return createDiagramOnServer(storage, diagram);
};
