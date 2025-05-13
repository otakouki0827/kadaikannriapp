import { Injectable, NgZone } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(
    private firestore: Firestore,
    private ngZone: NgZone
  ) {}

  getAllUserEmails(): Observable<string[]> {
    const usersRef = collection(this.firestore, 'users');
    return this.ngZone.run(() => collectionData(usersRef, { idField: 'uid' }).pipe(
      map((users: any[]) => users.map(u => u.email))
    ));
  }
} 