import { Injectable, NgZone } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, User, onAuthStateChanged } from '@angular/fire/auth';
import { from, Observable } from 'rxjs';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private auth: Auth,
    private ngZone: NgZone,
    private firestore: Firestore
  ) {}

  // ログイン
  login(email: string, password: string): Observable<any> {
    return from(this.ngZone.run(() => signInWithEmailAndPassword(this.auth, email, password).then(cred => {
      if (cred.user) {
        const userDoc = doc(this.firestore, `users/${cred.user.uid}`);
        setDoc(userDoc, {
          uid: cred.user.uid,
          email: cred.user.email
        }, { merge: true });
      }
      return cred;
    })));
  }

  // ログアウト
  logout(): Observable<void> {
    return from(this.ngZone.run(() => signOut(this.auth)));
  }

  // 新規登録
  register(email: string, password: string): Observable<any> {
    return from(this.ngZone.run(() => createUserWithEmailAndPassword(this.auth, email, password).then(cred => {
      if (cred.user) {
        const userDoc = doc(this.firestore, `users/${cred.user.uid}`);
        setDoc(userDoc, {
          uid: cred.user.uid,
          email: cred.user.email
        }, { merge: true });
      }
      return cred;
    })));
  }

  // 現在のユーザーを取得
  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }

  // ユーザー状態の監視
  onAuthStateChanged(callback: (user: User | null) => void) {
    return this.ngZone.run(() => onAuthStateChanged(this.auth, user => {
      callback(user);
    }));
  }
} 