export interface UndoRedoTransaction {
  id: string;
  timestamp: number;
  description: string;
  mutations: any[]; // define stricter type as needed
}
