import { Injectable, NgZone } from '@angular/core';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, deleteDoc, query, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Project {
  id?: string;
  name: string;
  description?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  category?: string;
  tags?: string[];
  progress: number;
  bigProjectId?: number;
  assignee?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  category?: string;
  tags?: string[];
  progress: number;
  projectId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  assignee?: string;
  completedDate?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(
    private firestore: Firestore,
    private ngZone: NgZone
  ) {}

  getProjects(): Observable<Project[]> {
    const projectsRef = collection(this.firestore, 'projects');
    return this.ngZone.run(() => collectionData(projectsRef, { idField: 'id' }) as Observable<Project[]>);
  }

  addProject(project: Project) {
    const projectsRef = collection(this.firestore, 'projects');
    return addDoc(projectsRef, project).then(docRef => {
      return updateDoc(docRef, { id: docRef.id });
    });
  }

  updateProject(id: string, data: Partial<Project>) {
    const projectDoc = doc(this.firestore, `projects/${id}`);
    return updateDoc(projectDoc, data);
  }

  deleteProject(id: string) {
    const projectDoc = doc(this.firestore, `projects/${id}`);
    return deleteDoc(projectDoc);
  }

  // --- タスク管理 ---
  getTasks(projectId: string): Observable<Task[]> {
    const tasksRef = collection(this.firestore, 'tasks');
    const q = query(tasksRef, where('projectId', '==', projectId));
    return this.ngZone.run(() => collectionData(q, { idField: 'id' }) as Observable<Task[]>);
  }

  addTask(task: Task) {
    const tasksRef = collection(this.firestore, 'tasks');
    return addDoc(tasksRef, task).then(docRef => {
      return updateDoc(docRef, { id: docRef.id });
    });
  }

  updateTask(id: string, data: Partial<Task>) {
    const taskDoc = doc(this.firestore, `tasks/${id}`);
    return updateDoc(taskDoc, data);
  }

  deleteTask(id: string) {
    const taskDoc = doc(this.firestore, `tasks/${id}`);
    return deleteDoc(taskDoc);
  }

  getAllTasks(): Observable<Task[]> {
    const tasksRef = collection(this.firestore, 'tasks');
    return this.ngZone.run(() => collectionData(tasksRef, { idField: 'id' }) as Observable<Task[]>);
  }

  // --- ビッグプロジェクト管理 ---
  getBigProjects(): Observable<any[]> {
    const bigProjectsRef = collection(this.firestore, 'bigProjectsTest');
    return this.ngZone.run(() => collectionData(bigProjectsRef, { idField: 'id' }) as Observable<any[]>);
  }

  addBigProject(bigProject: any) {
    const bigProjectsRef = collection(this.firestore, 'bigProjectsTest');
    return addDoc(bigProjectsRef, bigProject).then(docRef => {
      return updateDoc(docRef, { id: docRef.id });
    });
  }

  updateBigProject(id: string, data: Partial<any>) {
    const bigProjectDoc = doc(this.firestore, `bigProjectsTest/${id}`);
    return updateDoc(bigProjectDoc, data);
  }

  deleteBigProject(id: string) {
    const bigProjectDoc = doc(this.firestore, `bigProjectsTest/${id}`);
    return deleteDoc(bigProjectDoc);
  }

  // --- サブプロジェクト管理 ---
  getSubProjects(bigProjectId: string): Observable<any[]> {
    const path = `bigProjectsTest/${bigProjectId}/subProjects`;
    const subProjectsRef = collection(this.firestore, path);
    console.log('[getSubProjects] Firestoreパス:', path);
    const obs = this.ngZone.run(() => collectionData(subProjectsRef, { idField: 'id' }) as Observable<any[]>);
    obs.subscribe(data => {
      console.log('[getSubProjects] 取得結果:', data);
    });
    return obs;
  }

  addSubProject(bigProjectId: string, subProject: any) {
    const subProjectsRef = collection(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects`);
    return addDoc(subProjectsRef, subProject).then(docRef => {
      return updateDoc(docRef, { id: docRef.id });
    });
  }

  updateSubProject(bigProjectId: string, subProjectId: string, data: Partial<any>) {
    const subProjectDoc = doc(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}`);
    return updateDoc(subProjectDoc, data);
  }

  deleteSubProject(bigProjectId: string, subProjectId: string) {
    const subProjectDoc = doc(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}`);
    return deleteDoc(subProjectDoc);
  }

  // --- サブタスク管理 ---
  getSubTasks(bigProjectId: string, subProjectId: string): Observable<any[]> {
    const subTasksRef = collection(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}/subTasks`);
    return this.ngZone.run(() => collectionData(subTasksRef, { idField: 'id' }) as Observable<any[]>);
  }

  addSubTask(bigProjectId: string, subProjectId: string, subTask: any) {
    const subTasksRef = collection(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}/subTasks`);
    return addDoc(subTasksRef, subTask).then(docRef => {
      return updateDoc(docRef, { id: docRef.id });
    });
  }

  updateSubTask(bigProjectId: string, subProjectId: string, subTaskId: string, data: any) {
    const subTaskDoc = doc(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}/subTasks/${subTaskId}`);
    return updateDoc(subTaskDoc, data);
  }

  deleteSubTask(bigProjectId: string, subProjectId: string, subTaskId: string) {
    const subTaskDoc = doc(this.firestore, `bigProjectsTest/${bigProjectId}/subProjects/${subProjectId}/subTasks/${subTaskId}`);
    return deleteDoc(subTaskDoc);
  }
} 