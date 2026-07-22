export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id?: number;
  title: string;
  description?: string;
  completed: boolean;
  due_date?: string | null;
  priority: TodoPriority;
  created_at?: string;
  updated_at?: string;
}
