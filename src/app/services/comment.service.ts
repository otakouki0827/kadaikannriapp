import { Injectable, NgZone } from '@angular/core';
import { Firestore, collection, addDoc, collectionData, query, where, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface TaskComment {
  id?: string;
  taskId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  parentId?: string;
}

@Injectable({ providedIn: 'root' })
export class CommentService {
  constructor(
    private firestore: Firestore,
    private ngZone: NgZone
  ) {}

  // コメント追加
  async addComment(comment: TaskComment) {
    const ref = collection(this.firestore, 'taskComments');
    // parentIdがundefinedの場合はフィールドごと送らない
    const { parentId, ...rest } = comment;
    const data: any = { ...rest, createdAt: new Date().toISOString() };
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      data.parentId = parentId;
    }
    const docRef = await addDoc(ref, data);
    await updateDoc(doc(this.firestore, `taskComments/${docRef.id}`), { id: docRef.id });
  }

  // タスクごとのコメント取得（リアルタイム）
  getComments(taskId: string): Observable<TaskComment[]> {
    const ref = collection(this.firestore, 'taskComments');
    const q = query(ref, where('taskId', '==', taskId));
    return this.ngZone.run(() => collectionData(q, { idField: 'id' }) as Observable<TaskComment[]>);
  }

  // コメント削除
  deleteComment(commentId: string) {
    return deleteDoc(doc(this.firestore, `taskComments/${commentId}`));
  }

  // コメント編集
  editComment(commentId: string, content: string) {
    return updateDoc(doc(this.firestore, `taskComments/${commentId}`), { content });
  }
} 