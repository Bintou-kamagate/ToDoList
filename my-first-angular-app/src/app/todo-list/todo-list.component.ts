import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Todo, TodoPriority } from '../models/todo.model';
import { TodoService } from '../services/todo.service';

type Filter = 'all' | 'active' | 'completed';
type SortBy = 'created_desc' | 'created_asc' | 'due_date' | 'priority' | 'title';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const PRIORITY_WEIGHT: Record<TodoPriority, number> = { high: 3, medium: 2, low: 1 };
const PRIORITY_LABELS: Record<TodoPriority, string> = { high: 'Haute', medium: 'Moyenne', low: 'Basse' };

@Component({
  selector: 'app-todo-list',
  imports: [ReactiveFormsModule],
  templateUrl: './todo-list.component.html',
  styleUrls: ['./todo-list.component.css'],
})
export class TodoListComponent implements OnInit {
  private readonly todoService = inject(TodoService);
  private readonly fb = inject(FormBuilder);

  todos = signal<Todo[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);
  editingTodo = signal<Todo | null>(null);
  todoToDelete = signal<Todo | null>(null);
  toasts = signal<Toast[]>([]);

  filter = signal<Filter>('all');
  searchText = signal('');
  sortBy = signal<SortBy>('created_desc');

  todoForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    due_date: [''],
    priority: ['medium' as TodoPriority, [Validators.required]],
  });

  private toastSeq = 0;

  counts = computed(() => {
    const all = this.todos();
    const completed = all.filter((t) => t.completed).length;
    return { total: all.length, completed, active: all.length - completed };
  });

  filteredTodos = computed(() => {
    const filter = this.filter();
    const search = this.searchText().trim().toLowerCase();
    const sortBy = this.sortBy();

    let result = this.todos().filter((todo) => {
      if (filter === 'active' && todo.completed) return false;
      if (filter === 'completed' && !todo.completed) return false;
      if (search && !todo.title.toLowerCase().includes(search) && !(todo.description ?? '').toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'created_asc':
          return (a.created_at ?? '').localeCompare(b.created_at ?? '');
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        case 'priority':
          return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_desc':
        default:
          return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      }
    });

    return result;
  });

  ngOnInit(): void {
    this.loadTodos();
  }

  loadTodos(): void {
    this.isLoading.set(true);
    this.todoService.getTodos().subscribe({
      next: (data) => {
        this.todos.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.showToast('Impossible de charger les tâches. Vérifiez la connexion au serveur.', 'error');
      },
    });
  }

  submitForm(): void {
    this.editingTodo() ? this.updateTodo() : this.createTodo();
  }

  createTodo(): void {
    if (this.todoForm.invalid || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    const value = this.normalizedFormValue();
    this.todoService.createTodo(value).subscribe({
      next: (todo) => {
        this.todos.update((list) => [todo, ...list]);
        this.todoForm.reset({ title: '', description: '', due_date: '', priority: 'medium' });
        this.isSubmitting.set(false);
        this.showToast('Tâche ajoutée.', 'success');
      },
      error: () => {
        this.isSubmitting.set(false);
        this.showToast("Échec de l'ajout de la tâche.", 'error');
      },
    });
  }

  editTodo(todo: Todo): void {
    this.editingTodo.set(todo);
    this.todoForm.patchValue({
      title: todo.title,
      description: todo.description || '',
      due_date: todo.due_date || '',
      priority: todo.priority,
    });
  }

  updateTodo(): void {
    const editing = this.editingTodo();
    if (this.todoForm.invalid || !editing || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    const value = this.normalizedFormValue();
    this.todoService.updateTodo(editing.id!, { ...editing, ...value }).subscribe({
      next: (todo) => {
        this.todos.update((list) => list.map((t) => (t.id === todo.id ? todo : t)));
        this.editingTodo.set(null);
        this.todoForm.reset({ title: '', description: '', due_date: '', priority: 'medium' });
        this.isSubmitting.set(false);
        this.showToast('Tâche mise à jour.', 'success');
      },
      error: () => {
        this.isSubmitting.set(false);
        this.showToast('Échec de la mise à jour.', 'error');
      },
    });
  }

  cancelEdit(): void {
    this.editingTodo.set(null);
    this.todoForm.reset({ title: '', description: '', due_date: '', priority: 'medium' });
  }

  toggleTodo(todo: Todo): void {
    if (todo.completed) return;

    this.todoService.toggleTodo(todo).subscribe({
      next: (updated) => {
        this.todos.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      },
      error: () => this.showToast('Échec de la mise à jour du statut.', 'error'),
    });
  }

  requestDelete(todo: Todo): void {
    this.todoToDelete.set(todo);
  }

  cancelDelete(): void {
    this.todoToDelete.set(null);
  }

  confirmDelete(): void {
    const todo = this.todoToDelete();
    if (!todo) return;

    this.todoService.deleteTodo(todo.id!).subscribe({
      next: () => {
        this.todos.update((list) => list.filter((t) => t.id !== todo.id));
        this.todoToDelete.set(null);
        this.showToast('Tâche supprimée.', 'success');
      },
      error: () => {
        this.todoToDelete.set(null);
        this.showToast('Échec de la suppression.', 'error');
      },
    });
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  setSortBy(value: string): void {
    this.sortBy.set(value as SortBy);
  }

  onSearchInput(value: string): void {
    this.searchText.set(value);
  }

  isOverdue(todo: Todo): boolean {
    if (!todo.due_date || todo.completed) return false;
    return todo.due_date < new Date().toISOString().slice(0, 10);
  }

  priorityLabel(priority: TodoPriority): string {
    return PRIORITY_LABELS[priority];
  }

  dismissToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    const id = ++this.toastSeq;
    this.toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.dismissToast(id), 4000);
  }

  private normalizedFormValue(): Partial<Todo> {
    const raw = this.todoForm.getRawValue();
    return {
      title: raw.title ?? '',
      description: raw.description || '',
      due_date: raw.due_date || null,
      priority: (raw.priority || 'medium') as TodoPriority,
    };
  }
}
