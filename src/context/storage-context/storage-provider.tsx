import React, { useMemo, useRef } from 'react';
import type { Diagram } from '@/lib/domain/diagram';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { Note } from '@/lib/domain/note';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';

type DiagramCollectionKey =
    | 'tables'
    | 'relationships'
    | 'dependencies'
    | 'areas'
    | 'customTypes'
    | 'notes';

type Entity =
    | DBTable
    | DBRelationship
    | DBDependency
    | Area
    | DBCustomType
    | Note;

interface MemoryState {
    config: ChartDBConfig;
    diagrams: Map<string, Diagram>;
    filters: Map<string, DiagramFilter>;
}

const clone = <T,>(value: T): T => structuredClone(value);

const normalizeDiagram = (diagram: Diagram): Diagram => ({
    ...clone(diagram),
    tables: clone(diagram.tables ?? []),
    relationships: clone(diagram.relationships ?? []),
    dependencies: clone(diagram.dependencies ?? []),
    areas: clone(diagram.areas ?? []),
    customTypes: clone(diagram.customTypes ?? []),
    notes: clone(diagram.notes ?? []),
});

/** Session state only. Persistent diagrams live exclusively in backend MySQL. */
export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const stateRef = useRef<MemoryState>({
        config: { defaultDiagramId: '' },
        diagrams: new Map(),
        filters: new Map(),
    });

    const value = useMemo<StorageContext>(() => {
        const state = stateRef.current;
        const diagram = (diagramId: string) => state.diagrams.get(diagramId);

        const collection = <T extends Entity>(
            diagramId: string,
            key: DiagramCollectionKey
        ): T[] => {
            const current = diagram(diagramId);
            if (!current) return [];
            const items = (current[key] ?? []) as T[];
            if (!current[key]) {
                (current as unknown as Record<string, T[]>)[key] = items;
            }
            return items;
        };

        const addEntity = async <T extends Entity>(
            diagramId: string,
            key: DiagramCollectionKey,
            entity: T
        ) => {
            collection<T>(diagramId, key).push(clone(entity));
        };

        const getEntity = async <T extends Entity>(
            diagramId: string,
            key: DiagramCollectionKey,
            id: string
        ): Promise<T | undefined> => {
            const found = collection<T>(diagramId, key).find(
                (item) => item.id === id
            );
            return found ? clone(found) : undefined;
        };

        const updateEntity = async <T extends Entity>(
            key: DiagramCollectionKey,
            id: string,
            attributes: Partial<T>
        ) => {
            for (const current of state.diagrams.values()) {
                const items = (current[key] ?? []) as T[];
                const index = items.findIndex((item) => item.id === id);
                if (index >= 0) {
                    items[index] = { ...items[index], ...clone(attributes) };
                    return;
                }
            }
        };

        const putEntity = async <T extends Entity>(
            diagramId: string,
            key: DiagramCollectionKey,
            entity: T
        ) => {
            const items = collection<T>(diagramId, key);
            const index = items.findIndex((item) => item.id === entity.id);
            if (index >= 0) items[index] = clone(entity);
            else items.push(clone(entity));
        };

        const deleteEntity = async (
            diagramId: string,
            key: DiagramCollectionKey,
            id: string
        ) => {
            const current = diagram(diagramId);
            if (!current) return;
            const items = (current[key] ?? []) as Entity[];
            (current as unknown as Record<string, Entity[]>)[key] =
                items.filter((item) => item.id !== id);
        };

        const listEntities = async <T extends Entity>(
            diagramId: string,
            key: DiagramCollectionKey
        ): Promise<T[]> => clone(collection<T>(diagramId, key));

        const clearEntities = async (
            diagramId: string,
            key: DiagramCollectionKey
        ) => {
            const current = diagram(diagramId);
            if (current) {
                (current as unknown as Record<string, Entity[]>)[key] = [];
            }
        };

        return {
            getConfig: async () => clone(state.config),
            updateConfig: async (config) => {
                state.config = { ...state.config, ...clone(config) };
            },
            getDiagramFilter: async (diagramId) => {
                const filter = state.filters.get(diagramId);
                return filter ? clone(filter) : undefined;
            },
            updateDiagramFilter: async (diagramId, filter) => {
                state.filters.set(diagramId, clone(filter));
                const current = diagram(diagramId);
                if (current) current.filter = clone(filter);
            },
            deleteDiagramFilter: async (diagramId) => {
                state.filters.delete(diagramId);
                const current = diagram(diagramId);
                if (current) delete current.filter;
            },
            addDiagram: async ({ diagram: item }) => {
                const normalized = normalizeDiagram(item);
                state.diagrams.set(item.id, normalized);
                if (item.filter) state.filters.set(item.id, clone(item.filter));
            },
            listDiagrams: async () =>
                [...state.diagrams.values()].map(normalizeDiagram),
            getDiagram: async (id) => {
                const current = diagram(id);
                return current ? normalizeDiagram(current) : undefined;
            },
            updateDiagram: async ({ id, attributes }) => {
                const current = diagram(id);
                if (!current) return;
                const next = { ...current, ...clone(attributes) };
                const nextId = attributes.id ?? id;
                if (nextId !== id) {
                    state.diagrams.delete(id);
                    const filter = state.filters.get(id);
                    state.filters.delete(id);
                    if (filter) state.filters.set(nextId, filter);
                }
                state.diagrams.set(nextId, next);
            },
            deleteDiagram: async (id) => {
                state.diagrams.delete(id);
                state.filters.delete(id);
            },
            addTable: ({ diagramId, table }) =>
                addEntity(diagramId, 'tables', table),
            getTable: ({ diagramId, id }) =>
                getEntity<DBTable>(diagramId, 'tables', id),
            updateTable: ({ id, attributes }) =>
                updateEntity<DBTable>('tables', id, attributes),
            putTable: ({ diagramId, table }) =>
                putEntity(diagramId, 'tables', table),
            deleteTable: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'tables', id),
            listTables: (diagramId) =>
                listEntities<DBTable>(diagramId, 'tables'),
            deleteDiagramTables: (diagramId) =>
                clearEntities(diagramId, 'tables'),
            addRelationship: ({ diagramId, relationship }) =>
                addEntity(diagramId, 'relationships', relationship),
            getRelationship: ({ diagramId, id }) =>
                getEntity<DBRelationship>(diagramId, 'relationships', id),
            updateRelationship: ({ id, attributes }) =>
                updateEntity<DBRelationship>('relationships', id, attributes),
            deleteRelationship: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'relationships', id),
            listRelationships: async (diagramId) =>
                (
                    await listEntities<DBRelationship>(
                        diagramId,
                        'relationships'
                    )
                ).sort((a, b) => a.name.localeCompare(b.name)),
            deleteDiagramRelationships: (diagramId) =>
                clearEntities(diagramId, 'relationships'),
            addDependency: ({ diagramId, dependency }) =>
                addEntity(diagramId, 'dependencies', dependency),
            getDependency: ({ diagramId, id }) =>
                getEntity<DBDependency>(diagramId, 'dependencies', id),
            updateDependency: ({ id, attributes }) =>
                updateEntity<DBDependency>('dependencies', id, attributes),
            deleteDependency: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'dependencies', id),
            listDependencies: (diagramId) =>
                listEntities<DBDependency>(diagramId, 'dependencies'),
            deleteDiagramDependencies: (diagramId) =>
                clearEntities(diagramId, 'dependencies'),
            addArea: ({ diagramId, area }) =>
                addEntity(diagramId, 'areas', area),
            getArea: ({ diagramId, id }) =>
                getEntity<Area>(diagramId, 'areas', id),
            updateArea: ({ id, attributes }) =>
                updateEntity<Area>('areas', id, attributes),
            deleteArea: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'areas', id),
            listAreas: (diagramId) => listEntities<Area>(diagramId, 'areas'),
            deleteDiagramAreas: (diagramId) =>
                clearEntities(diagramId, 'areas'),
            addCustomType: ({ diagramId, customType }) =>
                addEntity(diagramId, 'customTypes', customType),
            getCustomType: ({ diagramId, id }) =>
                getEntity<DBCustomType>(diagramId, 'customTypes', id),
            updateCustomType: ({ id, attributes }) =>
                updateEntity<DBCustomType>('customTypes', id, attributes),
            deleteCustomType: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'customTypes', id),
            listCustomTypes: (diagramId) =>
                listEntities<DBCustomType>(diagramId, 'customTypes'),
            deleteDiagramCustomTypes: (diagramId) =>
                clearEntities(diagramId, 'customTypes'),
            addNote: ({ diagramId, note }) =>
                addEntity(diagramId, 'notes', note),
            getNote: ({ diagramId, id }) =>
                getEntity<Note>(diagramId, 'notes', id),
            updateNote: ({ id, attributes }) =>
                updateEntity<Note>('notes', id, attributes),
            deleteNote: ({ diagramId, id }) =>
                deleteEntity(diagramId, 'notes', id),
            listNotes: (diagramId) => listEntities<Note>(diagramId, 'notes'),
            deleteDiagramNotes: (diagramId) =>
                clearEntities(diagramId, 'notes'),
        };
    }, []);

    return (
        <storageContext.Provider value={value}>
            {children}
        </storageContext.Provider>
    );
};
