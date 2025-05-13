import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommentService, TaskComment } from '../../services/comment.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';

@Component({
  selector: 'app-task-comment-section',
  templateUrl: './task-comment-section.component.html',
  styleUrls: ['./task-comment-section.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe]
})
export class TaskCommentSectionComponent implements OnInit, OnChanges {
  @Input() taskId!: string;
  comments$: Observable<TaskComment[]> | undefined;
  commentTree: TaskComment[] = [];
  newCommentContent: string = '';
  replyToComment: TaskComment | null = null;
  currentUserEmail: string = '';
  currentUserId: string = '';

  // メンションサジェスト用
  allUserEmails: string[] = [];
  mentionSuggestions: string[] = [];
  showMentionSuggestions: boolean = false;
  mentionQuery: string = '';
  mentionStartPos: number | null = null;

  showCommentHistory: boolean = false;

  constructor(
    private commentService: CommentService,
    private authService: AuthService,
    private userService: UserService
  ) {}

  ngOnInit() {
    this.subscribeComments();
    const user = this.authService.getCurrentUser();
    this.currentUserEmail = user?.email || '';
    this.currentUserId = user?.uid || '';
    // ユーザー一覧取得
    this.userService.getAllUserEmails().subscribe(emails => {
      this.allUserEmails = emails;
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['taskId'] && !changes['taskId'].firstChange) {
      this.subscribeComments();
    }
  }

  subscribeComments() {
    this.comments$ = this.commentService.getComments(this.taskId);
    this.comments$.subscribe(comments => {
      this.commentTree = this.buildCommentTree(comments);
    });
  }

  // メンションサジェスト表示ロジック
  onCommentInput(event: any) {
    const value: string = event.target.value;
    const caret = event.target.selectionStart;
    const textBeforeCaret = value.slice(0, caret);
    // 直前の@とその後の文字列を抽出
    const match = textBeforeCaret.match(/@([\w\.-]*)$/);
    if (match) {
      this.mentionQuery = match[1];
      this.mentionStartPos = caret - this.mentionQuery.length - 1;
      this.mentionSuggestions = this.allUserEmails.filter(email => email.toLowerCase().includes(this.mentionQuery.toLowerCase()));
      this.showMentionSuggestions = this.mentionSuggestions.length > 0;
    } else {
      this.showMentionSuggestions = false;
      this.mentionSuggestions = [];
      this.mentionStartPos = null;
    }
  }

  // メンション候補クリック時
  selectMention(email: string, textarea: HTMLTextAreaElement) {
    if (this.mentionStartPos === null) return;
    const before = this.newCommentContent.slice(0, this.mentionStartPos);
    const after = this.newCommentContent.slice(textarea.selectionStart);
    this.newCommentContent = before + '@' + email + ' ' + after;
    this.showMentionSuggestions = false;
    this.mentionSuggestions = [];
    this.mentionQuery = '';
    this.mentionStartPos = null;
    // カーソル位置を@挿入直後に
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = (before + '@' + email + ' ').length;
    }, 0);
  }

  // スレッド表示用に親子関係で整形
  buildCommentTree(comments: TaskComment[]): TaskComment[] {
    const map: { [id: string]: TaskComment & { replies?: TaskComment[] } } = {};
    const roots: TaskComment[] = [];
    comments.forEach(c => (map[c.id!] = { ...c, replies: [] }));
    comments.forEach(c => {
      if (c.parentId && map[c.parentId]) {
        map[c.parentId].replies!.push(map[c.id!]);
      } else {
        roots.push(map[c.id!]);
      }
    });
    return roots;
  }

  // コメント投稿
  async postComment() {
    if (!this.newCommentContent.trim()) return;
    const comment: TaskComment = {
      taskId: this.taskId,
      userId: this.currentUserId,
      userName: this.currentUserEmail,
      content: this.newCommentContent,
      createdAt: '', // サービス側で自動付与
      parentId: this.replyToComment?.id
    };
    await this.commentService.addComment(comment);
    this.newCommentContent = '';
    this.replyToComment = null;
    this.showMentionSuggestions = false;
    this.mentionSuggestions = [];
    this.mentionQuery = '';
    this.mentionStartPos = null;
    this.showCommentHistory = true; // コメント投稿後に履歴を必ず表示
  }

  // 返信ボタン
  setReplyTo(comment: TaskComment) {
    this.replyToComment = comment;
  }

  // 返信キャンセル
  cancelReply() {
    this.replyToComment = null;
  }

  // コメント削除
  async deleteComment(comment: TaskComment) {
    if (comment.userId !== this.currentUserId) return;
    await this.commentService.deleteComment(comment.id!);
  }

  toggleCommentHistory() {
    this.showCommentHistory = !this.showCommentHistory;
  }
} 