import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, HostListener, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFireStorageModule } from '@angular/fire/compat/storage';
import { environment } from '../environments/environment';
import { ProjectService, Project } from './services/project.service';
import { Observable, Subscription } from 'rxjs';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AuthService } from './services/auth.service';
import { User } from '@angular/fire/auth';
import { Firestore, collection, addDoc } from '@angular/fire/firestore';
import { NgZone } from '@angular/core';
import { TaskCommentSectionComponent } from './components/task-comment-section/task-comment-section.component';

interface AppUser {
  id: number;
  username: string;
  password: string;  // 実際のアプリケーションでは、パスワードはハッシュ化して保存します
  firstName?: string;
  lastName?: string;
  role: 'admin' | 'user';
  createdAt: Date;
  lastLogin?: Date;
}

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
}

interface TaskProgress {
  date: string;
  plannedTasks: number;
  completedTasks: number;
}

interface BurnupData {
  date: string;
  plannedTasks: number;
  completedTasks: number;
  label: string;
}



interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'not-started' | 'in-progress' | 'completed';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  assignee?: string;
  category?: string;
  completedDate?: string;
}

interface BigProject {
  id: string;
  name: string;
  description?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  category?: string; // ← priorityからcategoryに
  tags?: string[];
  progress: number;
  bigProjectId?: string;
  assignee?: string;  // 担当者
  budget?: number;
  status?: string;
  // priority?: string; // ← 削除
  subProjects?: SubProject[] | undefined;
}

interface SubProject {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  assignee?: string;
  tasks: SubProjectTask[];
}

interface SubProjectTask {
  id: string;
  subProjectId: string;
  title: string;
  description?: string;
  status: 'not-started' | 'in-progress' | 'completed';
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  assignee?: string;
  completedDate?: string;
}

interface GanttTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  assignee: string;
  status: 'not-started' | 'in-progress' | 'completed';
}

interface EditingTask {
  task: Task | SubProjectTask;
  projectId: string;
  subProjectId?: string;
}

interface SearchFilters {
  projects: boolean;
  tasks: boolean;
  bigProjects: boolean;
  subProjects: boolean;
  subTasks: boolean; // ← 追加
}

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'project' | 'task' | 'bigProject' | 'subProject' | 'subTask'; // ← 'subProjectTask'→'subTask'
  typeLabel: string;
  parent?: string;
  dates?: string;
  status?: string;
  projectId?: string;
  subProjectId?: string;
  bigProjectId?: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    CommonModule,
    DatePipe,
    ScrollingModule,
    FormsModule,
    TaskCommentSectionComponent // ← 追加
  ]
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'プロジェクト管理';
  
  currentView: 'list' | 'gantt' | 'board' | 'burnup' | 'files' | 'bigProject' | 'search' = 'list';
  projects: Project[] = [];
  bigProjects: BigProject[] = [];
  selectedProject: Project | null = null;
  selectedBigProject: BigProject | null = null;
  projectTasks: { [projectId: string]: Task[] } = {};
  showProjectForm = false;
  showBigProjectForm = false;
  projectTaskForms: { [key: string]: boolean } = {};
  newTasks: { [key: string]: Partial<Task> } = {};
  activePanel: 'projects' | 'tasks' = 'projects';
  editingProject: Project | null = null;
  editingTask: EditingTask | null = null;
  editingBigProject: BigProject | null = null;
  
  private nextProjectId = 1;
  private nextBigProjectId = 1;

  newProject: Partial<Project> = this.getEmptyProject();
  newBigProject: Partial<BigProject> = this.getEmptyBigProject();
  showBigProjectCreateForm = false;
  showSubProjectForm: { [key: string]: boolean } = {};
  newSubProject: { [key: string]: Partial<SubProject> } = {};
  private nextSubProjectId = 1;

  showSubProjectTaskForm: { [key: string]: boolean } = {};
  newSubProjectTask: { [key: string]: Partial<SubProjectTask> } = {};
  private nextSubProjectTaskId = 1;

  editingSubProject: { bigProjectId: string; subProject: SubProject } | null = null;
  editingSubProjectTask: { bigProjectId: string; subProjectId: string; task: SubProjectTask } | null = null;

  ganttTasks: GanttTask[] = [];
  ganttStartDate: string = '2024-04-01';
  ganttEndDate: string = '2024-06-30';
  ganttMonths: string[] = ['4月', '5月', '6月'];

  burnupData: BurnupData[] = [];
  burnupIdealData: BurnupData[] = [];
  burnupStartDate: string = '';
  burnupEndDate: string = '';

  selectedProjectForBurnup: Project | SubProject | null = null;
  selectedProjectForBurnupId: string | null = null;

  // 検索関連のプロパティ
  searchQuery: string = '';
  searchResults: SearchResult[] = [];
  searchFilters: SearchFilters = {
    projects: true,
    tasks: true,
    bigProjects: true,
    subProjects: true,
    subTasks: true // ← 追加
  };

  // アカウント関連のプロパティ
  currentUser: any = null; // Firebase User型
  showLoginForm = false;
  showRegisterForm = false;
  loginForm: LoginForm = {
    email: '',
    password: '',
    rememberMe: false
  };
  registerForm: RegisterForm = {
    email: '',
    password: '',
    confirmPassword: ''
  };
  loginError = '';
  registerError = '';

  projects$: Observable<Project[]>;
  tasksSubscription: { [projectId: string]: Subscription } = {};
  isAuthReady = false;
  userMenuOpen = false;

  bigProjects$: Observable<BigProject[]>;
  bigProjectsSubscription: Subscription | null = null;

  subProjects$: Observable<any[]> | null = null;
  subProjectsSubscription: Subscription | null = null;
  currentSubProjects: any[] = [];
  currentSubProjectsMap: { [bigProjectId: string]: any[] } = {};

  expandedBigProjectIds: Set<string> = new Set();
  currentSubTasksMap: { [subProjectId: string]: any[] } = {};
  showSubTaskForm: { [subProjectId: string]: boolean } = {};
  newSubTask: { [subProjectId: string]: any } = {};
  editingSubTask: { bigProjectId: string; subProjectId: string; subTask: any } | null = null;

  // ... 既存のプロパティの下に追加 ...
  selectedGanttTargetId: string = '';

  showCompleteDateWarning: boolean = false;
  private lastTaskToRevert: { task: Task | SubProjectTask, projectId: string } | null = null;

  // バーチャートの横幅（px）
  barChartContainerWidth: number = 340;
  @ViewChild('barChartContainer', { static: false }) barChartContainerRef?: ElementRef;

  boardTasksNotStarted: (Task | SubProjectTask)[] = [];
  boardTasksInProgress: (Task | SubProjectTask)[] = [];
  boardTasksCompleted: (Task | SubProjectTask)[] = [];

  subTasksSubscriptions: { [subProjectId: string]: Subscription } = {};

  ngAfterViewInit() {
    this.tryUpdateBarChartContainerWidthWithRetry();
  }

  private tryUpdateBarChartContainerWidthWithRetry(retryCount: number = 0) {
    setTimeout(() => {
      if (this.barChartContainerRef && this.barChartContainerRef.nativeElement) {
        const width = this.barChartContainerRef.nativeElement.clientWidth || 0;
        if (width < 100 && retryCount < 10) {
          // 100px未満なら最大10回までリトライ（50ms間隔）
          this.tryUpdateBarChartContainerWidthWithRetry(retryCount + 1);
          return;
        }
        this.barChartContainerWidth = width || 340;
        this.cdr.markForCheck();
      }
    }, 50);
  }

  @HostListener('window:resize')
  onResize() {
    this.updateBarChartContainerWidth();
  }

  updateBarChartContainerWidth() {
    setTimeout(() => {
      if (this.barChartContainerRef && this.barChartContainerRef.nativeElement) {
        this.barChartContainerWidth = this.barChartContainerRef.nativeElement.clientWidth || 340;
        this.cdr.markForCheck();
      }
    }, 0);
  }

  getBarChartSvgWidth(isForLabelCalc: boolean = false): number {
    if (isForLabelCalc) {
      // ラベル計算用の幅取得時は最低幅を返す（無限再帰防止）
      return Math.max(this.barChartContainerWidth, 340);
    }
    const minWidth = (this.getBurnupBarChartLabelsAndPositions(true).length - 1) * 18 + 80;
    return Math.max(this.barChartContainerWidth, minWidth, 340);
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private projectService: ProjectService,
    private authService: AuthService,
    private firestore: Firestore,
    private ngZone: NgZone
  ) {
    this.projects$ = this.projectService.getProjects();
    this.bigProjects$ = this.projectService.getBigProjects();
    this.loadInitialData();
    this.checkStoredAuth();  // 保存された認証情報のチェック
    // Firebase APIの購読やonAuthStateChangedはngOnInitで行う
  }

  ngOnInit() {
    this.ngZone.run(() => {
      this.authService.onAuthStateChanged((user: any) => {
        this.currentUser = user;
        this.isAuthReady = true;
        this.cdr.markForCheck();
      });
      this.projects$.subscribe(projects => {
        this.projects = projects;
        console.log('プロジェクト取得完了', projects); // ← 追加
        // すべてのプロジェクトのタスクを購読
        projects.forEach(project => {
          if (project.id && !this.tasksSubscription[project.id]) {
            this.subscribeTasks(project.id);
          }
        });
        if (this.projects.length > 0) {
          if (!this.selectedProjectForBurnupId) {
            this.selectedProjectForBurnupId = this.projects[0].id!;
            this.onBurnupProjectChange();
          }
        }
        this.cdr.markForCheck();
      });
      this.bigProjectsSubscription = this.bigProjects$.subscribe(bigProjects => {
        this.bigProjects = bigProjects;
        bigProjects.forEach(bp => {
          this.projectService.getSubProjects(bp.id).subscribe(subProjects => {
            // bigProjectIdを必ずセット
            const subProjectsWithParent = subProjects.map(sp => ({
              ...sp,
              bigProjectId: bp.id, // ←ここでセット
              bigProjectName: bp.name
            }));
            this.currentSubProjectsMap[bp.id] = subProjectsWithParent;
            // 全サブプロジェクトを集約
            const allSubProjects: any[] = [];
            Object.values(this.currentSubProjectsMap).forEach(list => allSubProjects.push(...list));
            this.currentSubProjects = allSubProjects;
            // ここで全サブプロジェクトのサブタスクも購読
            subProjectsWithParent.forEach((sp: any) => {
              this.subscribeSubTasks(bp.id, sp.id);
            });
            this.cdr.markForCheck();
          });
        });
      });
    });
  }

  private getEmptyProject(): Partial<Project> {
    return {
      name: '',
      description: '',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '17:30',
      category: '',
      tags: [],
      progress: 0,
      assignee: ''
    };
  }

  private getEmptyTask(projectId: string): Partial<Task> {
    return {
      title: '',
      description: '',
      status: 'not-started',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '17:30',
      projectId: projectId
    };
  }

  private getEmptyBigProject(): Partial<BigProject> {
    return {
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      budget: 0,
      status: 'planning',
      progress: 0,
      assignee: '',
      category: '', // ← priorityからcategoryに
    };
  }

  private getEmptySubProject(): SubProject {
    return {
      id: '0',
      name: '',
      description: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      tasks: []
    };
  }

  private getEmptySubProjectTask(): Partial<SubProjectTask> {
    return {
      title: '',
      description: '',
      status: 'not-started',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '17:30'
    };
  }

  private loadInitialData() {
    // Firestoreのデータのみを使うため、ローカルのテストデータ追加は削除
    this.projects = [];
    this.projectTasks = {};
    this.bigProjects = [];
    this.showSubProjectForm = {};
    this.newSubProject = {};
    this.showSubProjectTaskForm = {};
    this.newSubProjectTask = {};
  }

  switchView(view: 'list' | 'gantt' | 'board' | 'burnup' | 'files' | 'bigProject' | 'search') {
    this.currentView = view;
    if (view === 'board') {
      this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
      this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
      this.boardTasksCompleted = this.getAllTasksByStatus('completed');
    }
    // バーンアップ/バーンダウン系ビュー切り替え時は幅再取得
    if (view === 'burnup') {
      this.tryUpdateBarChartContainerWidthWithRetry();
    }
    this.cdr.markForCheck();
  }

  updateGanttChart() {
    const allTasks: GanttTask[] = [];
    if (this.selectedGanttTargetId.startsWith('project-')) {
      const projectId = this.selectedGanttTargetId.replace('project-', '');
      const tasks = this.projectTasks[projectId] || [];
      tasks.forEach(task => {
        if (task.startDate && task.endDate) {
          allTasks.push({
            id: task.id,
            name: task.title,
            startDate: task.startDate,
            endDate: task.endDate,
            assignee: task.assignee || '未割当',
            status: task.status
          });
        }
      });
    } else if (this.selectedGanttTargetId.startsWith('sub-')) {
      const subProjectId = this.selectedGanttTargetId.replace('sub-', '');
      // currentSubProjectsMap からもサブプロジェクトを探す
      let subProject = this.currentSubProjects.find(sp => sp.id === subProjectId);
      if (!subProject) {
        const allSubProjects = Object.values(this.currentSubProjectsMap).flat();
        subProject = allSubProjects.find((sp: any) => sp.id === subProjectId);
      }
      if (subProject && Array.isArray(subProject.tasks)) {
        subProject.tasks.forEach((task: any) => {
          if (task.startDate && task.endDate) {
            allTasks.push({
              id: task.id,
              name: task.title,
              startDate: task.startDate,
              endDate: task.endDate,
              assignee: task.assignee || '未割当',
              status: task.status
            });
          }
        });
      }
      // サブタスク（currentSubTasksMap）
      const subTasks = this.currentSubTasksMap[subProjectId] || [];
      subTasks.forEach((task: any) => {
        if (task.startDate && task.endDate) {
          allTasks.push({
            id: task.id,
            name: task.title,
            startDate: task.startDate,
            endDate: task.endDate,
            assignee: task.assignee || '未割当',
            status: task.status
          });
        }
      });
    }
    // 開始日でソート
    this.ganttTasks = allTasks.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    // ガントチャートの表示期間を更新
    if (this.ganttTasks.length > 0) {
      const dates = this.ganttTasks.map(task => [new Date(task.startDate), new Date(task.endDate)]).flat();
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

      // 月初めに調整
      minDate.setDate(1);
      // 月末に調整
      maxDate.setMonth(maxDate.getMonth() + 1, 0);

      this.ganttStartDate = minDate.toISOString().split('T')[0];
      this.ganttEndDate = maxDate.toISOString().split('T')[0];

      // 月のリストを更新
      const months: string[] = [];
      const currentDate = new Date(minDate);
      while (currentDate <= maxDate) {
        months.push(`${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      this.ganttMonths = months;
    }

    this.cdr.markForCheck();
  }

  addProject() {
    if (!this.newProject.name || !this.newProject.startDate || !this.newProject.endDate) {
      alert('プロジェクト名と期間は必須です');
      return;
    }
    // 開始日と終了日のバリデーション
    const projectStart = new Date(this.newProject.startDate);
    const projectEnd = new Date(this.newProject.endDate);
    if (projectEnd < projectStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }

    // idを完全に排除し、Project型のid?: stringにのみ依存する
    const { name, description, startDate, startTime, endDate, endTime, category, tags } = this.newProject;
    const project: Project = {
      name: name!,
      description: description || '',
      startDate: startDate!,
      startTime: startTime || '09:00',
      endDate: endDate!,
      endTime: endTime || '17:30',
      category: category || '',
      tags: tags || [],
      progress: 0
    };

    this.projectService.addProject(project)
      .then(() => {
        this.resetProjectForm();
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへの追加に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  addTaskToProject(project: Project | undefined) {
    if (!project?.id) return;

    // 他のフォームをすべて閉じる
    Object.keys(this.projectTaskForms).forEach(key => {
      this.projectTaskForms[key] = false;
    });
    
    // 新しいタスクの初期化を確実に行う
    this.ensureNewTaskExists(project.id);

    // フォームの表示状態を更新
    this.projectTaskForms = {
      ...this.projectTaskForms,
      [project.id!]: true
    };
    
    this.cdr.markForCheck();
  }

  createTask(projectId: string | undefined) {
    if (!projectId) {
      console.error('プロジェクトIDが指定されていません');
      return;
    }
    const newTask = this.newTasks[projectId];
    if (!newTask?.title) {
      alert('タスク名は必須です');
      return;
    }
    if (!newTask?.startDate || !newTask?.endDate) {
      alert('期間（開始日・終了日）は必須です');
      return;
    }
    // 開始日と終了日のバリデーション
    const taskStart = new Date(newTask.startDate);
    const taskEnd = new Date(newTask.endDate);
    if (taskEnd < taskStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }
    // 完了日がある場合、終了日より後は不可
    if (newTask.completedDate) {
      const completed = new Date(newTask.completedDate);
      if (completed > taskEnd) {
        alert('完了日は終了日より後に設定できません');
        return;
      }
    }

    // Firestoreに追加
    this.projectService.addTask({
      ...newTask,
      projectId,
      status: newTask.status || 'not-started',
      startDate: newTask.startDate || '',
      startTime: newTask.startTime || '09:00',
      endDate: newTask.endDate || '',
      endTime: newTask.endTime || '17:30'
    } as any)
      .then(() => {
        this.resetTaskForm(projectId); // これでprojectTaskForms[projectId]がfalseになりUIが閉じる
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへの追加に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  private getNextTaskId(projectId: string): string {
    const tasks = this.projectTasks[projectId!] || [];
    return tasks.length > 0 ? String(Math.max(...tasks.map(t => Number(t.id))) + 1) : '1';
  }

  updateTaskStatus(task: Task | SubProjectTask, projectId?: string) {
    if (!task) return;

    if (this.isSubProjectTask(task)) {
      // サブプロジェクトタスクの場合はprojectId（bigProjectId）をそのまま使う
      const bigProjectId = projectId;
      if (bigProjectId) {
        this.updateSubProjectTaskStatus(
          bigProjectId,
          (task as SubProjectTask).subProjectId,
          task.id,
          task.status
        );
      }
    } else {
      // 通常のプロジェクトタスクの場合
      const projectTask = task as Task;
      const projectId = projectTask.projectId;
      const taskIndex = this.projectTasks[projectId]?.findIndex(t => t.id === projectTask.id);
      if (taskIndex !== undefined && taskIndex !== -1) {
        this.projectTasks[projectId][taskIndex] = { ...projectTask };
        // Firestoreへの反映は「完了」時のみcompletedDateも送信
        if (projectTask.status === 'completed') {
          this.projectService.updateTask(projectTask.id, { status: projectTask.status, completedDate: projectTask.completedDate ?? '' })
            .then(() => {
              this.updateProjectProgress(projectId);
              // バーンダウンも更新
              if (this.selectedProjectForBurnup && this.selectedProjectForBurnup.id === projectId) {
                this.updateProjectBurnup(this.selectedProjectForBurnup);
              }
              this.cdr.markForCheck();
            })
            .catch(err => {
              alert('Firestoreへの進捗更新に失敗しました: ' + err.message);
              console.error(err);
            });
        } else {
          this.projectService.updateTask(projectTask.id, { status: projectTask.status, completedDate: '' })
            .then(() => {
              this.updateProjectProgress(projectId);
              if (this.selectedProjectForBurnup && this.selectedProjectForBurnup.id === projectId) {
                this.updateProjectBurnup(this.selectedProjectForBurnup);
              }
              this.cdr.markForCheck();
            })
            .catch(err => {
              alert('Firestoreへの進捗更新に失敗しました: ' + err.message);
              console.error(err);
            });
        }
      }
    }
    this.updateGanttChart();
    this.cdr.markForCheck();
  }

  private updateProjectProgress(projectId: string) {
    const tasks = this.projectTasks[projectId!] || [];
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const progress = tasks.length === 0 ? 0 : 
      Math.round((completedTasks / tasks.length) * 100);

    this.projects = this.projects.map(project => 
      project.id === projectId 
        ? { ...project, progress } 
        : project
    );

    // Firestoreにもprogressを反映
    this.projectService.updateProject(projectId, { progress })
      .catch(err => {
        alert('Firestoreへのプロジェクト進捗更新に失敗しました: ' + err.message);
        console.error(err);
      });

    this.cdr.markForCheck();
  }

  resetProjectForm() {
    this.newProject = this.getEmptyProject();
    this.showProjectForm = false;
    this.cdr.markForCheck();
  }

  resetTaskForm(projectId?: string) {
    if (projectId) {
      this.newTasks = {
        ...this.newTasks,
        [projectId]: this.getEmptyTask(projectId)
      };
      this.projectTaskForms = {
        ...this.projectTaskForms,
        [projectId]: false
      };
    } else {
      this.newTasks = {};
      this.projectTaskForms = {};
    }
    this.cdr.markForCheck();
  }

  selectProject(project: Project) {
    this.selectedProject = { ...project };
    this.activePanel = 'tasks';
    this.subscribeTasks(project.id!);
    // バーンダウンも更新
    this.updateProjectBurnup(project);
    this.cdr.markForCheck();
  }

  getProjectTasks(projectId: string | undefined): Task[] {
    if (!projectId) return [];
    return this.projectTasks[projectId!] || [];
  }

  trackByProjectId(index: number, project: Project): string {
    return project.id!;
  }

  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  calculateProjectDuration(project: Project): string {
    if (!project.startDate || !project.endDate) return '';

    // 日付のみを表示（時間は表示しない）
    const start = new Date(`${project.startDate}T00:00`);
    const end = new Date(`${project.endDate}T00:00`);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    // 日付範囲の文字列
    const rangeStr = `${project.startDate} ～ ${project.endDate}`;
    // 日数のみ表示
    const durationStr = days > 1 ? `${days}日間` : '1日';
    return `${rangeStr}（${durationStr}）`;
  }

  calculateTaskDuration(task: Task, showTime: boolean = true): string {
    if (!task.startDate || !task.endDate) return '';

    if (!showTime) {
      // 日付のみ表示
      return `${task.startDate} ～ ${task.endDate}`;
    }

    const start = new Date(`${task.startDate}T${task.startTime || '00:00'}`);
    const end = new Date(`${task.endDate}T${task.endTime || '00:00'}`);
    
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const hours = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
    
    const startStr = `${task.startDate} ${task.startTime || '00:00'}`;
    const endStr = `${task.endDate} ${task.endTime || '00:00'}`;
    const rangeStr = `${startStr} ～ ${endStr}`;
    const durationStr = days > 1 ? `${days}日間` : `${hours}時間`;
    return `${rangeStr}（${durationStr}）`;
  }

  // タスク編集関連のメソッド
  editTask(task: Task | SubProjectTask, projectId: string) {
    try {
      // 通常のTaskまたはSubProjectTaskの場合
      if (this.isSubProjectTask(task)) {
        const subProjectTask = task as SubProjectTask;
        this.editingTask = {
          task: { ...subProjectTask },
          projectId: projectId,
          subProjectId: subProjectTask.subProjectId
        };
      } else {
        const regularTask = task as Task;
        this.editingTask = {
          task: { ...regularTask },
          projectId: projectId
        };
      }

      // 変更検知を強制的に実行
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error in editTask:', error);
    }
  }

  saveTaskEdit() {
    try {
      if (!this.editingTask) return;

      // Validate required fields
      if (!this.editingTask.task.title) {
        alert('タスク名は必須です');
        return;
      }

      // Validate dates
      if (this.editingTask.task.startDate && this.editingTask.task.endDate) {
        const startDate = new Date(this.editingTask.task.startDate);
        const endDate = new Date(this.editingTask.task.endDate);
        if (endDate < startDate) {
          alert('終了日は開始日より後に設定してください');
          return;
        }
        // 完了日がある場合、終了日より後は不可
        if (this.editingTask.task.completedDate) {
          const completed = new Date(this.editingTask.task.completedDate);
          if (completed > endDate) {
            alert('完了日は終了日より後に設定できません');
            return;
          }
        }
      }

      const editingTask = this.editingTask;
      if (editingTask.subProjectId) {
        // サブプロジェクトタスクの編集
        const bigProject = this.bigProjects.find(bp => bp.id === editingTask.projectId);
        if (!bigProject) return;

        const subProject = this.currentSubProjects.find(sp => sp.id === editingTask.subProjectId);
        if (!subProject) return;

        const taskIndex = subProject.tasks.findIndex((t: SubProjectTask) => t.id === editingTask.task.id);
        if (taskIndex !== -1) {
          subProject.tasks[taskIndex] = { ...editingTask.task } as SubProjectTask;
          this.updateBigProjectProgress(editingTask.projectId);
          // Firestoreにも反映
          this.projectService.updateSubTask(editingTask.projectId, editingTask.subProjectId, editingTask.task.id, editingTask.task)
            .then(() => {
              this.subscribeSubTasks(editingTask.projectId as string, editingTask.subProjectId as string);
              // ボード用リストも再計算
              this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
              this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
              this.boardTasksCompleted = this.getAllTasksByStatus('completed');
              this.cdr.detectChanges();
            })
            .catch(err => {
              alert('Firestoreへのサブタスク更新に失敗しました: ' + err.message);
              console.error(err);
            });
        }
      } else {
        // 通常のプロジェクトタスクの編集
        const projectTasks = this.projectTasks[editingTask.projectId];
        if (!projectTasks) return;

        const taskIndex = projectTasks.findIndex(t => t.id === editingTask.task.id);
        if (taskIndex !== -1) {
          projectTasks[taskIndex] = { ...editingTask.task } as Task;
          this.updateProjectProgress(editingTask.projectId);
          // Firestoreにも反映
          this.projectService.updateTask(editingTask.task.id, editingTask.task)
            .then(() => {
              this.cdr.detectChanges();
              this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
              this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
              this.boardTasksCompleted = this.getAllTasksByStatus('completed');
            })
            .catch(err => {
              alert('Firestoreへのタスク更新に失敗しました: ' + err.message);
              console.error(err);
            });
        }
      }

      // 編集状態をリセット
      this.editingTask = null;
    } catch (error) {
      console.error('Error in saveTaskEdit:', error);
    }
  }

  cancelTaskEdit() {
    try {
      // 編集状態をリセット
      this.editingTask = null;
      
      // 変更検知を強制的に実行
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error in cancelTaskEdit:', error);
    }
  }

  deleteTask(taskId: string | undefined, projectId: string | undefined) {
    console.log('[deleteTask] called', { taskId, projectId });
    if (!taskId) {
      alert('タスクIDが不正です');
      return;
    }
    if (!projectId) {
      if (!confirm('タスクのprojectIdが取得できませんが、削除しますか？')) return;
    } else {
      if (!confirm('このタスクを削除してもよろしいですか？')) return;
    }

    this.projectService.deleteTask(taskId)
      .then(() => {
        if (projectId && this.projectTasks[projectId]) {
          const tasks = this.projectTasks[projectId];
          this.projectTasks = {
            ...this.projectTasks,
            [projectId]: tasks.filter(t => t.id !== taskId)
          };
          this.updateProjectProgress(projectId);
          this.updateGanttChart();
        }
        // ボードリスト再計算
        this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
        this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
        this.boardTasksCompleted = this.getAllTasksByStatus('completed');
        this.cdr.markForCheck();
        alert('タスクを削除しました');
        // ガントチャートからも即時除去
        this.ganttTasks = this.ganttTasks.filter(t => t.id !== taskId);
      })
      .catch(err => {
        alert('Firestoreからのタスク削除に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  // プロジェクト編集関連のメソッド
  editProject(project: Project) {
    this.editingProject = { ...project };
    this.cdr.markForCheck();
  }

  cancelProjectEdit() {
    this.editingProject = null;
    this.cdr.markForCheck();
  }

  saveProjectEdit() {
    console.log('saveProjectEdit called', this.editingProject);
    if (!this.editingProject) return;
    if (!this.editingProject.name || !this.editingProject.startDate || !this.editingProject.endDate) {
      alert('プロジェクト名と期間は必須です');
      return;
    }
    // 開始日と終了日のバリデーション
    const editProjectStart = new Date(this.editingProject.startDate);
    const editProjectEnd = new Date(this.editingProject.endDate);
    if (editProjectEnd < editProjectStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }
    // 完了日がある場合、終了日より後は不可
    if ((this.editingProject as any).completedDate && this.editingProject.endDate) {
      const completed = new Date((this.editingProject as any).completedDate);
      const endDate = new Date(this.editingProject.endDate);
      if (completed > endDate) {
        alert('完了日は終了日より後に設定できません');
        return;
      }
    }

    // Firestoreにも保存
    if (this.editingProject.id) {
      this.projectService.updateProject(this.editingProject.id, {
        name: this.editingProject.name ?? '',
        description: this.editingProject.description ?? '',
        startDate: this.editingProject.startDate ?? '',
        startTime: this.editingProject.startTime ?? '',
        endDate: this.editingProject.endDate ?? '',
        endTime: this.editingProject.endTime ?? '',
        category: this.editingProject.category ?? '',
        tags: this.editingProject.tags ?? [],
        progress: this.editingProject.progress ?? 0,
        assignee: this.editingProject.assignee ?? ''
      });
    }

    this.projects = this.projects.map(p => 
      p.id === this.editingProject!.id ? { ...this.editingProject! } : p
    );

    if (this.selectedProject?.id === this.editingProject.id) {
      this.selectedProject = { ...this.editingProject };
    }

    this.editingProject = null;
    this.cdr.markForCheck();
  }

  deleteProject(id: string) {
    if (!confirm('このプロジェクトを削除してもよろしいですか？')) return;
    this.projectService.deleteProject(id)
      .then(() => {
        delete this.projectTasks[id];
        if (this.selectedProject?.id === id) {
          this.selectedProject = null;
        }
        this.activePanel = 'projects';
        alert('プロジェクトを削除しました');
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreからの削除に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  getAllTasksByStatus(status: 'not-started' | 'in-progress' | 'completed'): (Task | SubProjectTask)[] {
    // 通常のプロジェクトタスク
    const regularTasks = Object.values(this.projectTasks)
      .flat()
      .filter(task => task.status === status)
      .map(task => ({
        ...task,
        type: 'regular' as const
      }));

    // サブプロジェクトのサブタスク（currentSubTasksMap）のみ
    const subProjectSubTasks = Object.entries(this.currentSubTasksMap)
      .flatMap(([subProjectId, tasks]) => {
        // サブプロジェクト情報を取得
        const subProject = this.currentSubProjects.find(sp => sp.id === subProjectId);
        let bigProjectId = '';
        let bigProjectName = '';
        if (subProject) {
          bigProjectId = subProject.bigProjectId || '';
          bigProjectName = this.getBigProjectNameBySubProjectId(subProjectId);
        }
        return (tasks || [])
          .filter((task: any) => task.status === status)
          .map((task: any) => ({
            ...task,
            type: 'subProjectSubTask' as const,
            subProjectId,
            subProjectName: subProject ? subProject.name : '',
            bigProjectName: bigProjectName,
            projectId: bigProjectId, // ← ここを追加
            isSubTask: true
          }));
      });

    return [...regularTasks, ...subProjectSubTasks];
  }

  getProjectName(projectId: string): string {
    if (projectId === '-1') {
      return ''; // サブプロジェクトタスクの場合は空文字を返す
    }
    const project = this.projects.find(p => p.id === projectId);
    return project ? project.name : '';
  }

  getSubProjectName(subProjectId: string): string {
    for (const bigProject of this.bigProjects) {
      const subProject = this.currentSubProjects?.find(sp => sp.id === subProjectId);
      if (subProject) {
        return subProject.name;
      }
    }
    return '';
  }

  getBigProjectNameBySubProjectId(subProjectId: string): string {
    const subProject = this.currentSubProjects?.find(sp => sp.id === subProjectId);
    return subProject?.bigProjectName || '';
  }

  // タスクパネルで全てのタスクを表示するためのメソッド
  getAllTasks(): (Task | SubProjectTask)[] {
    // 通常のプロジェクトのタスク
    const regularTasks = this.projects.flatMap(project => 
      this.getProjectTasks(project.id!).map(task => ({
        ...task,
        projectType: 'regular' as const
      }))
    );

    // サブプロジェクトのタスク
    const subProjectTasks = this.currentSubProjects.flatMap((sp: any) => 
      (sp.tasks || []).map((task: any) => ({
        ...task,
        projectType: 'subProject' as const,
        bigProjectId: sp.bigProjectId,
        bigProjectName: sp.bigProjectName,
        subProjectName: sp.name
      }))
    );

    return [...regularTasks, ...subProjectTasks];
  }

  // ビッグプロジェクト関連のメソッド
  addBigProject() {
    if (!this.newBigProject.name) {
      alert('ビッグプロジェクト名は必須です');
      return;
    }
    if (!this.newBigProject.startDate || !this.newBigProject.endDate) {
      alert('期間（開始日・終了日）は必須です');
      return;
    }
    // 開始日と終了日のバリデーション
    const bigProjectStart = new Date(this.newBigProject.startDate);
    const bigProjectEnd = new Date(this.newBigProject.endDate);
    if (bigProjectEnd < bigProjectStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }
    // subProjectsフィールドを含めない
    const bigProject = {
      name: this.newBigProject.name!,
      description: this.newBigProject.description || '',
      startDate: this.newBigProject.startDate,
      endDate: this.newBigProject.endDate,
      budget: this.newBigProject.budget || 0,
      status: this.newBigProject.status || 'planning',
      progress: 0,
      assignee: this.newBigProject.assignee,
      category: this.newBigProject.category || '', // ← priorityからcategoryに
    };
    this.projectService.addBigProject(bigProject)
      .then(() => {
        this.resetBigProjectForm();
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへの追加に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  selectBigProject(bigProject: BigProject) {
    console.log('[selectBigProject] 呼び出し', bigProject);
    // 展開状態をトグル
    if (this.expandedBigProjectIds.has(bigProject.id)) {
      this.expandedBigProjectIds.delete(bigProject.id);
      this.cdr.markForCheck();
      return;
    } else {
      this.expandedBigProjectIds.add(bigProject.id);
    }
    this.selectedBigProject = { ...bigProject };
    this.currentView = 'bigProject';
    if (this.subProjectsSubscription) {
      this.subProjectsSubscription.unsubscribe();
    }
    console.log('[selectBigProject] getSubProjects呼び出し直前', bigProject.id);
    this.subProjects$ = this.projectService.getSubProjects(bigProject.id);
    this.subProjectsSubscription = this.subProjects$.subscribe(subProjects => {
      this.currentSubProjectsMap[bigProject.id] = subProjects;
      // 全ビッグプロジェクトのサブプロジェクトを集約
      const allSubProjects: any[] = [];
      Object.values(this.currentSubProjectsMap).forEach(list => allSubProjects.push(...list));
      this.currentSubProjects = allSubProjects;
      // サブプロジェクトごとにサブタスク購読
      subProjects.forEach((sp: any) => {
        this.subscribeSubTasks(bigProject.id, sp.id);
      });
      console.log('[subProjects取得]', subProjects);
      this.cdr.markForCheck();
    });
    this.cdr.markForCheck();
  }

  deleteBigProject(id: string) {
    if (!confirm('このビッグプロジェクトを削除してもよろしいですか？')) return;
    this.projectService.deleteBigProject(id)
      .then(() => {
        if (this.selectedBigProject?.id === id) {
          this.selectedBigProject = null;
        }
        alert('ビッグプロジェクトを削除しました');
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreからの削除に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  resetBigProjectForm() {
    this.newBigProject = {
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      budget: 0,
      status: 'planning',
      progress: 0,
      assignee: '',
      category: '', // ← priorityからcategoryに
    };
    this.showBigProjectCreateForm = false;
    this.cdr.markForCheck();
  }

  editBigProject(bigProject: BigProject) {
    this.editingBigProject = { ...bigProject };
    this.cdr.markForCheck();
  }

  cancelBigProjectEdit() {
    this.editingBigProject = null;
    this.cdr.markForCheck();
  }

  saveBigProjectEdit() {
    if (!this.editingBigProject) return;
    if (!this.editingBigProject.name) {
      alert('ビッグプロジェクト名は必須です');
      return;
    }
    this.projectService.updateBigProject(this.editingBigProject.id, this.editingBigProject)
      .then(() => {
        if (this.selectedBigProject?.id === this.editingBigProject!.id) {
          this.selectedBigProject = { ...this.editingBigProject! };
        }
        this.editingBigProject = null;
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへの更新に失敗しました: ' + err.message);
        console.error(err);
      });
  }

  showBigProjectCreateAlert() {
    this.showBigProjectForm = true;
    this.cdr.markForCheck();
  }

  calculateBigProjectDuration(bigProject: BigProject): string {
    if (!bigProject.startDate || !bigProject.endDate) return '';
    
    const start = new Date(bigProject.startDate);
    const end = new Date(bigProject.endDate);
    
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    return `${bigProject.startDate} ～ ${bigProject.endDate}（${days}日間）`;
  }

  showSubProjectCreateForm(bigProjectId: string | undefined) {
    if (!bigProjectId) return;

    if (!this.showSubProjectForm[bigProjectId]) {
      this.showSubProjectForm[bigProjectId] = true;
    }

    if (!this.newSubProject[bigProjectId]) {
      this.newSubProject[bigProjectId] = this.getEmptySubProject();
    }
  }

  createSubProject(bigProjectId: string) {
    if (!bigProjectId || !this.newSubProject[bigProjectId]) {
      alert('ビッグプロジェクトIDが不正です');
      return;
    }
    const src = this.newSubProject[bigProjectId];
    if (!src.startDate || !src.endDate) {
      alert('期間（開始日・終了日）は必須です');
      return;
    }
    // 親ビッグプロジェクトの期間取得
    const parentBigProject = this.bigProjects.find(bp => bp.id === bigProjectId);
    if (parentBigProject && parentBigProject.startDate && parentBigProject.endDate) {
      const parentStart = new Date(parentBigProject.startDate);
      const parentEnd = new Date(parentBigProject.endDate);
      const subProjectStart = new Date(src.startDate);
      const subProjectEnd = new Date(src.endDate);
      if (subProjectStart < parentStart) {
        alert('サブプロジェクトの開始日はビッグプロジェクトの開始日以降にしてください');
        return;
      }
      if (subProjectEnd > parentEnd) {
        alert('サブプロジェクトの終了日はビッグプロジェクトの終了日以前にしてください');
        return;
      }
    }
    // 開始日と終了日のバリデーション
    const subProjectStart = new Date(src.startDate);
    const subProjectEnd = new Date(src.endDate);
    if (subProjectEnd < subProjectStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }

    // Firestoreに送るデータはundefinedを空文字に
    const newSubProject = {
      name: src.name || '',
      description: src.description || '',
      startDate: src.startDate || '',
      endDate: src.endDate || '',
      startTime: src.startTime || '',
      endTime: src.endTime || '',
      assignee: src.assignee || '',
      tasks: []
    };

    // Firestoreのサブコレクションに追加
    this.projectService.addSubProject(bigProjectId, newSubProject)
      .then(() => {
        this.resetSubProjectForm(bigProjectId);
        this.cdr.markForCheck();
        alert('サブプロジェクトをFirestoreに追加しました');
      })
      .catch(err => {
        alert('Firestoreへのサブプロジェクト追加に失敗: ' + err.message);
        console.error(err);
      });
  }

  resetSubProjectForm(bigProjectId: string | undefined) {
    if (!bigProjectId) return;
    
    this.showSubProjectForm[bigProjectId] = false;
    this.newSubProject[bigProjectId] = this.getEmptySubProject();
  }

  updateBigProjectProgress(bigProjectId: string) {
    const bigProject = this.bigProjects.find(bp => bp.id === bigProjectId);
    if (!bigProject) return;
    const subProjects = this.currentSubProjectsMap[bigProjectId] || [];
    if (!subProjects.length) {
      bigProject.progress = 0;
      return;
    }
    const progresses = subProjects.map((sp: any) => this.getSubProjectProgressWithSubTasks(sp));
    const avgProgress = Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length);
    bigProject.progress = avgProgress;
  }

  

  showSubProjectTaskCreateForm(subProjectId: string | undefined) {
    if (!subProjectId) return;
    if (!this.showSubProjectTaskForm) {
      this.showSubProjectTaskForm = {};
    }
    if (!this.newSubProjectTask) {
      this.newSubProjectTask = {};
    }
    this.showSubProjectTaskForm[subProjectId] = true;
    this.newSubProjectTask[subProjectId] = this.getEmptySubProjectTask();
    this.cdr.markForCheck();
  }

  createSubProjectTask(bigProjectId: string, subProjectId: string | undefined) {
    if (!subProjectId) return;
    
    const task = this.newSubProjectTask[subProjectId];
    if (!task) return;
    if (!task.startDate || !task.endDate) {
      alert('期間（開始日・終了日）は必須です');
      return;
    }
    // 開始日と終了日のバリデーション
    const subTaskStart = new Date(task.startDate);
    const subTaskEnd = new Date(task.endDate);
    if (subTaskEnd < subTaskStart) {
      alert('終了日は開始日より後に設定してください');
      return;
    }
    // 完了日がある場合、終了日より後は不可
    if (task.completedDate) {
      const completed = new Date(task.completedDate);
      if (completed > subTaskEnd) {
        alert('完了日は終了日より後に設定できません');
        return;
      }
    }

    const newTask: SubProjectTask = {
      id: String(this.nextSubProjectTaskId++),
      subProjectId: subProjectId,
      title: task.title || '',
      description: task.description,
      status: 'not-started',
      startDate: task.startDate,
      startTime: task.startTime,
      endDate: task.endDate,
      endTime: task.endTime,
      assignee: task.assignee
    };

    const bigProject = this.bigProjects.find(p => p.id === bigProjectId);
    if (!bigProject) return;

    const subProject = this.currentSubProjects.find(sp => sp.id === subProjectId);
    if (!subProject) return;

    if (!subProject.tasks) {
      subProject.tasks = [];
    }
    subProject.tasks.push(newTask);
    this.resetSubProjectTaskForm(subProjectId);
    this.updateBigProjectProgress(bigProjectId);
  }

  resetSubProjectTaskForm(subProjectId: string | undefined) {
    if (!subProjectId || !this.showSubProjectTaskForm || !this.newSubProjectTask) return;
    this.showSubProjectTaskForm[subProjectId] = false;
    delete this.newSubProjectTask[subProjectId];
    this.cdr.markForCheck();
  }

  updateSubProjectTaskStatus(
    bigProjectId: string,
    subProjectId: string,
    taskId: string,
    newStatus: 'not-started' | 'in-progress' | 'completed'
  ) {
    if (!bigProjectId || !subProjectId || !taskId) return;

    const bigProject = this.bigProjects.find(bp => bp.id === bigProjectId);
    if (!bigProject) return;

    const subProject = this.currentSubProjects.find(sp => sp.id === subProjectId);
    if (!subProject) return;

    const task = subProject.tasks.find((t: SubProjectTask) => t.id === taskId);
    if (!task) return;

    task.status = newStatus;
    this.updateBigProjectProgress(bigProjectId);
  }

  deleteSubProjectTask(
    bigProjectId: string,
    subProjectId: string,
    taskId: string
  ) {
    console.log('[deleteSubTask] called', { bigProjectId, subProjectId, taskId });
    if (!confirm('このサブタスクを削除してもよろしいですか？')) return;
    this.projectService.deleteSubTask(bigProjectId, subProjectId, taskId)
      .then(() => {
        alert('サブタスクを削除しました');
        // 即時UIから除去
        if (this.currentSubTasksMap[subProjectId]) {
          this.currentSubTasksMap[subProjectId] = this.currentSubTasksMap[subProjectId].filter(t => t.id !== taskId);
        }
        this.ganttTasks = this.ganttTasks.filter(t => t.id !== taskId);
        this.subscribeSubTasks(bigProjectId, subProjectId);
        this.updateBigProjectProgress(bigProjectId);
        // ボードリスト再計算
        this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
        this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
        this.boardTasksCompleted = this.getAllTasksByStatus('completed');
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreからのサブタスク削除に失敗: ' + err.message);
        console.error(err);
      });
  }

  calculateSubProjectTaskDuration(task: SubProjectTask | undefined): string {
    if (!task?.startDate || !task?.endDate) return '';

    const start = new Date(`${task.startDate}T${task.startTime || '00:00'}`);
    const end = new Date(`${task.endDate}T${task.endTime || '00:00'}`);
    
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const hours = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
    
    const startStr = `${task.startDate} ${task.startTime || '00:00'}`;
    const endStr = `${task.endDate} ${task.endTime || '00:00'}`;
    const rangeStr = `${startStr} ～ ${endStr}`;
    const durationStr = days > 1 ? `${days}日間` : `${hours}時間`;
    return `${rangeStr}（${durationStr}）`;
  }

  getTaskDuration(task: Task | SubProjectTask): string {
    if (!task) return '';

    if (this.isSubProjectTask(task)) {
      return this.calculateSubProjectTaskDuration(task as SubProjectTask);
    }
    return this.calculateTaskDuration(task as Task);
  }

  getTaskProjectName(task: Task | SubProjectTask): string {
    if (!task) return '';

    if (this.isSubProjectTask(task)) {
      const subTask = task as SubProjectTask & { bigProjectName?: string; subProjectName?: string };
      if (subTask.bigProjectName && subTask.subProjectName) {
        return `${subTask.bigProjectName} > ${subTask.subProjectName}`;
      }
      // サブプロジェクト名の取得はcurrentSubProjectsから
      const subProject = this.currentSubProjects.find((sp: any) => sp.id === subTask.subProjectId);
      if (subProject) {
        // bigProject名は親bigProjectを探す必要がある場合は追加実装
        return subProject.name;
      }
      return '';
    }
    return this.getProjectName((task as Task).projectId);
  }

  isSubProjectTask(task: Task | SubProjectTask): task is SubProjectTask {
    return 'subProjectId' in task;
  }

  /**
   * サブプロジェクトIDからbigProjectIdを取得する
   * 必ずbigProjectIdを返す。見つからない場合はエラーをthrowする。
   */
  getBigProjectIdBySubProjectId(subProjectId: string | undefined): string {
    if (!subProjectId) throw new Error('subProjectId is required');
    // currentSubProjectsから探す
    const subProject = this.currentSubProjects.find((sp: any) => sp.id === subProjectId);
    if (!subProject || !subProject.bigProjectId) {
      throw new Error(`bigProjectId not found for subProjectId: ${subProjectId}`);
    }
    return subProject.bigProjectId;
  }

  // サブプロジェクトの編集メソッド
  editSubProject(bigProjectId: string | undefined, subProject: SubProject | undefined) {
    if (!bigProjectId || !subProject) return;
    this.expandedBigProjectIds.add(bigProjectId); // 追加
    this.editingSubProject = {
      bigProjectId,
      subProject: { ...subProject }
    };
    this.cdr.markForCheck();
  }

  cancelSubProjectEdit() {
    this.editingSubProject = null;
    this.cdr.markForCheck();
  }

  saveSubProjectEdit() {
    if (!this.editingSubProject?.bigProjectId || !this.editingSubProject?.subProject) return;

    const bigProjectId = this.editingSubProject.bigProjectId;
    const editingSubProject = this.editingSubProject.subProject;

    // 親ビッグプロジェクトの期間取得
    const parentBigProject = this.bigProjects.find(bp => bp.id === bigProjectId);
    if (parentBigProject && parentBigProject.startDate && parentBigProject.endDate && editingSubProject.startDate && editingSubProject.endDate) {
      const parentStart = new Date(parentBigProject.startDate);
      const parentEnd = new Date(parentBigProject.endDate);
      const subProjectStart = new Date(editingSubProject.startDate);
      const subProjectEnd = new Date(editingSubProject.endDate);
      if (subProjectStart < parentStart) {
        alert('サブプロジェクトの開始日はビッグプロジェクトの開始日以降にしてください');
        return;
      }
      if (subProjectEnd > parentEnd) {
        alert('サブプロジェクトの終了日はビッグプロジェクトの終了日以前にしてください');
        return;
      }
    }
    // 開始日と終了日のバリデーション
    if (editingSubProject.startDate && editingSubProject.endDate) {
      const editSubProjectStart = new Date(editingSubProject.startDate);
      const editSubProjectEnd = new Date(editingSubProject.endDate);
      if (editSubProjectEnd < editSubProjectStart) {
        alert('終了日は開始日より後に設定してください');
        return;
      }
      // 完了日がある場合、終了日より後は不可
      if ((editingSubProject as any).completedDate) {
        const completed = new Date((editingSubProject as any).completedDate);
        if (completed > editSubProjectEnd) {
          alert('完了日は終了日より後に設定できません');
          return;
        }
      }
    }

    // Firestoreに反映
    this.projectService.updateSubProject(bigProjectId, editingSubProject.id, editingSubProject)
      .then(() => {
        this.editingSubProject = null;
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへのサブプロジェクト更新に失敗: ' + err.message);
        console.error(err);
      });
  }

  // サブプロジェクトタスク編集メソッド
  editSubProjectTask(
    bigProjectId: string,
    subProjectId: string,
    task: SubProjectTask
  ) {
    if (!bigProjectId || !subProjectId || !task) return;

    this.editingSubProjectTask = {
      bigProjectId,
      subProjectId,
      task: { ...task }
    };
  }

  cancelSubProjectTaskEdit() {
    this.editingSubProjectTask = null;
    this.cdr.markForCheck();
  }
  // フォームデータを安全に取得・設定するためのメソッド
  getNewTaskProperty(projectId: string | undefined, property: keyof Task): any {
    if (!projectId) return '';
    return this.newTasks[projectId]?.[property] || '';
  }

  setNewTaskProperty(projectId: string | undefined, property: keyof Task, value: any) {
    if (!projectId) return;
    if (!this.newTasks[projectId]) {
      this.newTasks[projectId] = this.getEmptyTask(projectId);
    }
    this.newTasks[projectId] = {
      ...this.newTasks[projectId],
      [property]: value
    };
    this.cdr.markForCheck();
  }

  // タスクのプロパティを安全に取得するためのメソッド
  getTaskProperty(task: Task | SubProjectTask | GanttTask, property: string): any {
    try {
      if (!task) return '';

      // GanttTaskの場合、対応するTaskまたはSubProjectTaskを探す
      if ('name' in task) {
        const ganttTask = task as GanttTask;
        // プロジェクトタスクを検索
        for (const pid in this.projectTasks) {
          const tasks = this.projectTasks[pid];
          const foundTask = tasks.find(t => t.id === ganttTask.id);
          if (foundTask) {
            if (property === 'projectId') {
              return pid;
            }
            return foundTask[property as keyof Task];
          }
        }
        // サブプロジェクトタスクを検索
        for (const bigProject of this.bigProjects) {
          for (const subProject of this.currentSubProjects) {
            const foundTask = subProject.tasks.find((t: SubProjectTask) => t.id === ganttTask.id);
            if (foundTask) {
              if (property === 'projectId') {
                return bigProject.id;
              }
              return foundTask[property as keyof SubProjectTask];
            }
          }
        }
        // projectIdが見つからない場合
        if (property === 'projectId') {
          // すべてのprojectTasksを走査してid一致するもののprojectIdを返す
          for (const pid in this.projectTasks) {
            const tasks = this.projectTasks[pid];
            if (tasks.some(t => t.id === ganttTask.id)) {
              return pid;
            }
          }
        }
        return '';
      }

      // 通常のTaskまたはSubProjectTaskの場合
      if (this.isSubProjectTask(task)) {
        const subProjectTask = task as SubProjectTask & { bigProjectId?: string };
        if (property === 'projectId') {
          // まずcurrentSubProjectsからbigProjectIdを探す
          const subProject = this.currentSubProjects.find(sp => sp.id === subProjectTask.subProjectId);
          if (subProject && subProject.bigProjectId) {
            return subProject.bigProjectId;
          }
          // それでも見つからなければ従来の方法
          const bigProject = this.bigProjects.find(bp =>
            (bp.subProjects ?? []).some(sp => sp.id === subProjectTask.subProjectId)
          );
          return bigProject ? bigProject.id : '';
        }
        // 型エラー回避のためanyでアクセス
        return (subProjectTask as any)[property] || '';
      } else {
        const regularTask = task as Task & { type?: string };
        return regularTask[property as keyof (Task & { type?: string })] || '';
      }
    } catch (error) {
      console.error('Error in getTaskProperty:', error);
      return '';
    }
  }

  // 新しいタスクの初期化を確実に行うメソッド
  ensureNewTaskExists(projectId: string | undefined): Partial<Task> | null {
    if (!projectId) return null;
    if (!this.newTasks[projectId]) {
      this.newTasks[projectId] = this.getEmptyTask(projectId);
    }
    return this.newTasks[projectId];
  }

  // ガントチャートのタスク位置とサイズを計算するメソッド
  calculateTaskPosition(task: GanttTask): { left: string; width: string; backgroundColor: string } {
    const start = new Date(task.startDate);
    const end = new Date(task.endDate);
    const ganttStart = new Date(this.ganttStartDate);
    const ganttEnd = new Date(this.ganttEndDate);

    // 総日数（開始日と終了日を含む）
    const totalDays = (ganttEnd.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    // タスク開始までのオフセット日数
    const startOffset = (start.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24);
    // タスク期間（日数）
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;

    // 位置とサイズを計算
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;

    let backgroundColor = '#FFE4B5'; // デフォルト色
    switch (task.status) {
      case 'completed':
        backgroundColor = '#4CAF50'; // 完了：緑
        break;
      case 'in-progress':
        backgroundColor = '#2196F3'; // 進行中：青
        break;
      case 'not-started':
        backgroundColor = '#FFA07A'; // 未着手：オレンジ
        break;
    }

    return {
      left: `${left}%`,
      width: `${width}%`,
      backgroundColor
    };
  }

  // タスクのプロパティを設定するメソッド
  setTaskProperty(task: Task | SubProjectTask, property: string, value: any) {
    if (!task) return;

    // GanttTaskの場合は処理しない
    if ('name' in task) return;

    // プロパティを更新
    (task as any)[property] = value;

    // ステータスが変更された場合、進捗を更新
    if (property === 'status') {
      if (this.isSubProjectTask(task)) {
        const subProjectTask = task as SubProjectTask;
        const bigProjectId = this.getBigProjectIdBySubProjectId(subProjectTask.subProjectId);
        if (bigProjectId !== undefined) {
          this.updateSubProjectTaskStatus(
            bigProjectId,
            subProjectTask.subProjectId,
            subProjectTask.id,
            value
          );
        }
      } else {
        const regularTask = task as Task;
        this.updateTaskStatus(regularTask);
      }
    }

    this.cdr.markForCheck();
  }

  // プロジェクトの進捗率を取得
  getProjectProgress(projectId: string): number {
    const total = this.getTotalTaskCount(projectId);
    if (total === 0) return 0;
    const completed = this.getCompletedTaskCount(projectId);
    return Math.round((completed / total) * 100);
  }

  // プロジェクトの総タスク数を取得
  getTotalTaskCount(projectId: string): number {
    return this.projectTasks[projectId!]?.length || 0;
  }

  // プロジェクトの完了タスク数を取得
  getCompletedTaskCount(projectId: string): number {
    return this.projectTasks[projectId!]?.filter(t => t.status === 'completed').length || 0;
  }

  calculateChartPoints(data: BurnupData[]): string {
    if (!data.length) return '';
    
    // 開始点（0, 0）と現在の進捗点（100, 最終進捗率）のみを使用
    const finalProgress = data[data.length - 1].completedTasks;
    return `0,0 100,${finalProgress}`;
  }

  calculateIdealPoints(): string {
    // 理想的な進捗ライン（0%から100%へ）
    return '0,0 100,100';
  }

  getYAxisLabels(): number[] {
    // 100%から0%の順で表示
    return [100, 75, 50, 25, 0];
  }

  getGridLinePosition(value: number): string {
    // グリッドラインの位置（100%を下、0%を上に）
    return `${value}%`;
  }

  getFilteredDateLabels(data: BurnupData[]): BurnupData[] {
    // 開始日と終了日のみを表示
    return data;
  }

  updateProjectBurnup(selected: Project | SubProject | null) {
    console.log('[Burnup] 呼び出し: selected =', selected);
    this.burnupData = [];
    this.burnupIdealData = [];
    this.burnupStartDate = '';
    this.burnupEndDate = '';
    if (!selected || !selected.startDate || !selected.endDate) {
      console.log('[Burnup] 選択なしまたは日付未設定', selected);
      return;
    }

    // タスク取得（プロジェクトとサブプロジェクトで分岐）
    let tasks: Task[] = [];
    if (this.isSubProject(selected)) {
      // サブプロジェクト
      const subProjectId = (selected as any).id;
      const tasks1 = (selected as any).tasks || [];
      const tasks2 = this.currentSubTasksMap[subProjectId] || [];
      tasks = [...tasks1, ...tasks2];
      console.log('[Burnup] サブプロジェクト選択: tasks1 =', tasks1, 'tasks2 =', tasks2, '合計tasks =', tasks);
    } else if (selected && 'id' in selected) {
      // 通常プロジェクト
      tasks = this.getProjectTasks(selected.id!);
      console.log('[Burnup] 通常プロジェクト選択: tasks =', tasks);
    }
    if (!tasks.length) {
      console.log('[Burnup] タスクが空です', tasks);
      return;
    }

    // 完了タスクのみ抽出し、完了日で昇順ソート
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedDate).sort((a, b) => (a.completedDate! > b.completedDate! ? 1 : -1));
    console.log('[Burnup] 完了タスク:', completedTasks);
    const total = tasks.length;
    let completedCount = 0;
    let lastProgress = 0;
    let lastDate = '';
    this.burnupData = completedTasks.map(t => {
      completedCount++;
      const progress = Math.round((completedCount / total) * 100);
      lastProgress = progress;
      lastDate = t.completedDate!;
      return {
        date: t.completedDate!,
        plannedTasks: total,
        completedTasks: completedCount,
        label: t.completedDate!
      };
    });
    console.log('[Burnup] burnupData生成:', this.burnupData);
    // 最初の点（開始日0%）を追加
    if (selected.startDate) {
      this.burnupData.unshift({ date: selected.startDate, plannedTasks: total, completedTasks: 0, label: selected.startDate });
    }
    // 最後の点（100%）は、タスクが全て完了した日
    // burnupDataの最後の点が100%でなければ追加
    if (lastProgress < 100 && lastDate) {
      this.burnupData.push({ date: lastDate, plannedTasks: total, completedTasks: total, label: lastDate });
    }
    // 軸用
    this.burnupStartDate = selected.startDate;
    this.burnupEndDate = lastDate || selected.endDate;
    console.log('[Burnup] burnupData最終:', this.burnupData);
    this.cdr.markForCheck();
  }

  // 検索関連のメソッド
  onSearchQueryChange() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // プロジェクトの検索
    if (this.searchFilters.projects) {
      this.projects.forEach(project => {
        if (this.matchesSearch(project.name, project.description, query, project.assignee, project.category)) {
          results.push({
            id: project.id!,
            title: project.name,
            description: project.description,
            type: 'project',
            typeLabel: 'プロジェクト',
            dates: this.calculateProjectDuration(project),
            status: String(project.progress) + '%'
          });
        }
      });
    }

    // タスクの検索
    if (this.searchFilters.tasks) {
      Object.entries(this.projectTasks).forEach(([projectId, tasks]) => {
        tasks.forEach(task => {
          if (this.matchesSearch(task.title, task.description, query, task.assignee, task.category)) {
            const project = this.projects.find(p => p.id === projectId);
            results.push({
              id: task.id,
              title: task.title,
              description: task.description,
              type: 'task',
              typeLabel: 'タスク',
              parent: project ? project.name : '',
              dates: this.calculateTaskDuration(task),
              status: task.status,
              projectId: projectId
            });
          }
        });
      });
    }

    // ビッグプロジェクトの検索
    if (this.searchFilters.bigProjects) {
      this.bigProjects.forEach(bigProject => {
        if (this.matchesSearch(bigProject.name, bigProject.description, query, bigProject.assignee, bigProject.category)) {
          results.push({
            id: bigProject.id,
            title: bigProject.name,
            description: bigProject.description,
            type: 'bigProject',
            typeLabel: 'ビッグプロジェクト',
            dates: this.calculateBigProjectDuration(bigProject),
            status: bigProject.status
          });
        }
      });
    }

    // サブプロジェクトとそのタスクの検索
    if (this.searchFilters.subProjects) {
      this.bigProjects.forEach(bigProject => {
        this.currentSubProjects.forEach(subProject => {
          if (this.matchesSearch(subProject.name, subProject.description, query, subProject.assignee, subProject.category)) {
            results.push({
              id: subProject.id,
              title: subProject.name,
              description: subProject.description,
              type: 'subProject',
              typeLabel: 'サブプロジェクト',
              parent: bigProject.name,
              dates: this.calculateSubProjectDuration(subProject),
              bigProjectId: bigProject.id
            });
          }

          // サブプロジェクトのタスクも検索
          subProject.tasks.forEach((task: SubProjectTask) => {
            if (this.matchesSearch(task.title, task.description, query, task.assignee, (task as any).category ?? undefined)) {
              results.push({
                id: task.id,
                title: task.title,
                description: task.description,
                type: 'subTask',
                typeLabel: 'サブタスク',
                parent: `${bigProject.name} > ${subProject.name}`,
                dates: this.calculateSubProjectTaskDuration(task),
                status: task.status,
                bigProjectId: bigProject.id,
                subProjectId: subProject.id
              });
            }
          });
        });
      });
    }

    // サブタスク（currentSubTasksMap）だけの検索
    if (this.searchFilters.subTasks) {
      this.bigProjects.forEach(bigProject => {
        this.currentSubProjects.forEach(subProject => {
          const subTasks = this.currentSubTasksMap[subProject.id] || [];
          subTasks.forEach((task: SubProjectTask) => {
            if (this.matchesSearch(task.title, task.description, query, task.assignee, (task as any).category ?? undefined)) {
              results.push({
                id: task.id,
                title: task.title,
                description: task.description,
                type: 'subTask',
                typeLabel: 'サブタスク',
                parent: `${bigProject.name} > ${subProject.name}`,
                dates: this.calculateSubProjectTaskDuration(task),
                status: task.status,
                bigProjectId: bigProject.id,
                subProjectId: subProject.id
              });
            }
          });
        });
      });
    }

    this.searchResults = results;
  }

  private matchesSearch(title?: string, description?: string, query?: string, assignee?: string, category?: string): boolean {
    if (!query) return false;
    return (
      (title?.toLowerCase().includes(query) || false) ||
      (description?.toLowerCase().includes(query) || false) ||
      (assignee?.toLowerCase().includes(query) || false) ||
      (category?.toLowerCase().includes(query) || false)
    );
  }

  calculateSubProjectDuration(subProject: SubProject): string {
    if (!subProject.startDate || !subProject.endDate) return '';
    
    const start = new Date(subProject.startDate);
    const end = new Date(subProject.endDate);
    
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    return `${subProject.startDate} ～ ${subProject.endDate}（${days}日間）`;
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'not-started': '未着手',
      'in-progress': '進行中',
      'completed': '完了',
      'planning': '計画中',
      'active': '進行中',
      'on-hold': '保留中'
    };
    return statusMap[status] || status;
  }

  navigateToResult(result: SearchResult) {
    switch (result.type) {
      case 'project':
        this.currentView = 'list';
        this.activePanel = 'projects';
        const project = this.projects.find(p => p.id === result.id);
        if (project) {
          this.selectProject(project);
        }
        break;
      
      case 'task':
        this.currentView = 'list';
        this.activePanel = 'tasks';
        break;
      
      case 'bigProject':
        this.currentView = 'bigProject';
        const bigProject = this.bigProjects.find(bp => bp.id === result.id);
        if (bigProject) {
          this.selectBigProject(bigProject);
        }
        break;
      
      case 'subProject':
        if (result.bigProjectId) {
          const bp = this.bigProjects.find(bp => bp.id === result.bigProjectId);
          const subProject = (bp?.subProjects ?? []).find(sp => sp.id === result.id);
          if (bp && subProject) {
            this.editSubProject(bp.id, subProject);
          }
        }
        break;
      case 'subTask':
        if (result.bigProjectId && result.subProjectId) {
          const bp = this.bigProjects.find(bp => bp.id === result.bigProjectId);
          const sp = (bp?.subProjects ?? []).find(sp => sp.id === result.subProjectId);
          const task = sp?.tasks.find((t: SubProjectTask) => t.id === result.id);
          if (task) {
            this.editSubProjectTask(result.bigProjectId, result.subProjectId, task);
          }
        }
        break;
    }
    this.cdr.markForCheck();
  }

  editSearchResult(result: SearchResult) {
    switch (result.type) {
      case 'project':
        const project = this.projects.find(p => p.id === result.id);
        if (project) {
          this.editProject(project);
        }
        break;
      
      case 'task':
        if (result.projectId) {
          const tasks = this.projectTasks[result.projectId];
          const task = tasks?.find(t => t.id === result.id);
          if (task) {
            this.editTask(task, result.projectId);
          }
        }
        break;
      
      case 'bigProject':
        const bigProject = this.bigProjects.find(bp => bp.id === result.id);
        if (bigProject) {
          this.editBigProject(bigProject);
        }
        break;
      
      case 'subProject':
        if (result.bigProjectId) {
          const bp = this.bigProjects.find(bp => bp.id === result.bigProjectId);
          const subProject = (bp?.subProjects ?? []).find(sp => sp.id === result.id);
          if (bp && subProject) {
            this.editSubProject(bp.id, subProject);
          }
        }
        break;
      
      case 'subTask':
        if (result.bigProjectId && result.subProjectId) {
          const bp = this.bigProjects.find(bp => bp.id === result.bigProjectId);
          const sp = (bp?.subProjects ?? []).find(sp => sp.id === result.subProjectId);
          const task = sp?.tasks.find((t: SubProjectTask) => t.id === result.id);
          if (task) {
            this.editSubProjectTask(result.bigProjectId, result.subProjectId, task);
          }
        }
        break;
    }
  }

  // アカウント関連のメソッド
  private checkStoredAuth() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        this.currentUser = JSON.parse(storedUser);
        this.cdr.markForCheck();
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }
  }

  showLogin() {
    this.showLoginForm = true;
    this.showRegisterForm = false;
    this.loginError = '';
    this.loginForm = {
      email: '',
      password: '',
      rememberMe: false
    };
    this.cdr.markForCheck();
  }

  showRegister() {
    this.showRegisterForm = true;
    this.showLoginForm = false;
    this.registerError = '';
    this.registerForm = {
      email: '',
      password: '',
      confirmPassword: ''
    };
    this.cdr.markForCheck();
  }

  login() {
    this.loginError = '';
    if (!this.loginForm.email || !this.loginForm.password) {
      this.loginError = 'メールアドレスとパスワードを入力してください。';
      return;
    }
    this.authService.login(this.loginForm.email, this.loginForm.password).subscribe({
      next: (userCredential) => {
        this.loginError = '';
        this.showLoginForm = false;
        this.currentUser = userCredential.user;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loginError = 'ログインに失敗しました: ' + err.message;
        this.cdr.markForCheck();
      }
    });
  }

  register() {
    this.registerError = '';
    if (!this.registerForm.email || !this.registerForm.password || !this.registerForm.confirmPassword) {
      this.registerError = '必須項目を入力してください。';
      return;
    }
    if (this.registerForm.password !== this.registerForm.confirmPassword) {
      this.registerError = 'パスワードが一致しません。';
      return;
    }
    this.authService.register(this.registerForm.email, this.registerForm.password).subscribe({
      next: (userCredential) => {
        this.registerError = '';
        this.showRegisterForm = false;
        this.currentUser = userCredential.user;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.registerError = '登録に失敗しました: ' + err.message;
        this.cdr.markForCheck();
      }
    });
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.currentUser = null;
      this.cdr.markForCheck();
    });
  }

  // ガントチャート用のタスク編集メソッド
  editGanttTask(task: GanttTask, projectId: string) {
    try {
      // プロジェクトタスクを検索
      for (const pid in this.projectTasks) {
        const tasks = this.projectTasks[pid];
        const foundTask = tasks.find(t => t.id === task.id);
        if (foundTask) {
          this.editingTask = {
            task: { ...foundTask },
            projectId: pid
          };
          break;
        }
      }

      // サブプロジェクトタスクを検索
      if (!this.editingTask) {
        for (const bigProject of this.bigProjects) {
          for (const subProject of this.currentSubProjects
  
          ) {
            const foundTask = subProject.tasks.find((t: SubProjectTask) => t.id === task.id);
            if (foundTask) {
              this.editingTask = {
                task: { ...foundTask },
                projectId: bigProject.id,
                subProjectId: subProject.id
              };
              break;
            }
          }
          if (this.editingTask) break;
        }
      }

      // 変更検知を強制的に実行
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error in editGanttTask:', error);
    }
  }

  // GanttTaskから元のタスクを取得するメソッド
  getOriginalTask(ganttTask: GanttTask): Task | SubProjectTask {
    // プロジェクトタスクを検索
    for (const pid in this.projectTasks) {
      const tasks = this.projectTasks[pid];
      const foundTask = tasks.find(t => t.id === ganttTask.id);
      if (foundTask) {
        return foundTask;
      }
    }

    // サブプロジェクトタスクを検索
    for (const bigProject of this.bigProjects) {
      for (const subProject of this.currentSubProjects
      ) {
        const foundTask = subProject.tasks.find((t: SubProjectTask) => t.id === ganttTask.id);
        if (foundTask) {
          return foundTask;
        }
      }
    }

    // タスクが見つからない場合は、最低限必要なプロパティを持つオブジェクトを返す
    return {
      id: ganttTask.id,
      title: ganttTask.name,
      status: ganttTask.status,
      startDate: ganttTask.startDate,
      endDate: ganttTask.endDate,
      assignee: ganttTask.assignee,
      projectId: '-1'  // 仮のプロジェクトID
    } as Task;
  }

  // テンプレートボタン用メソッド
  applyProjectTemplate() {
    this.newProject = {
      name: 'テンプレートプロジェクト',
      description: 'これはテンプレートから作成されたプロジェクトです。',
      startDate: '2024-07-01',
      startTime: '09:00',
      endDate: '2024-07-31',
      endTime: '17:30',
      category: 'テンプレート',
      tags: [],
      progress: 0,
      assignee: 'テンプレ担当'
    };
    this.showProjectForm = true;
    this.cdr.markForCheck();
  }

  applyTaskTemplate(project: Project) {
    this.ensureNewTaskExists(project.id);
    this.newTasks[project.id!] = {
      title: 'テンプレートタスク',
      description: 'これはテンプレートから作成されたタスクです。',
      status: 'not-started',
      startDate: '2024-07-01',
      startTime: '09:00',
      endDate: '2024-07-07',
      endTime: '17:30',
      assignee: 'テンプレ担当',
      projectId: project.id
    };
    this.projectTaskForms[project.id!] = true;
    this.cdr.markForCheck();
  }

  getSubProjectProgress(subProject: SubProject): number {
    const total = subProject.tasks?.length || 0;
    if (total === 0) return 0;
    const completed = subProject.tasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / total) * 100);
  }

  // 型ガード: SubProjectかどうか判定
  isSubProject(obj: any): obj is SubProject {
    return obj && Array.isArray(obj.tasks);
  }

  // サブプロジェクトの完了タスク数
  getSubProjectCompletedTaskCount(subProject: SubProject): number {
    return subProject.tasks?.filter(t => t.status === 'completed').length || 0;
  }
  // サブプロジェクトの残タスク数
  getSubProjectRemainingTaskCount(subProject: SubProject): number {
    return (subProject.tasks?.length || 0) - this.getSubProjectCompletedTaskCount(subProject);
  }

  addProjectFirestore(project: Project) {
    this.projectService.addProject(project);
  }

  updateProjectFirestore(id: string, data: Partial<Project>) {
    this.projectService.updateProject(id, data);
  }

  deleteProjectFirestore(id: string) {
    this.projectService.deleteProject(id);
  }

  // Firestoreのtasksコレクションを購読しprojectTasksを更新
  subscribeTasks(projectId: string) {
    // 既存の購読があれば解除
    if (this.tasksSubscription[projectId]) {
      this.tasksSubscription[projectId].unsubscribe();
    }
    this.tasksSubscription[projectId] = this.projectService.getTasks(projectId).subscribe(tasks => {
      const filtered = tasks.filter(t => t.projectId === projectId)
        .map(t => ({
          ...t,
          id: t.id || '',
          status: (t.status as 'not-started' | 'in-progress' | 'completed') || 'not-started',
        }));
      this.projectTasks[projectId] = filtered;
      // バーンダウンも更新
      if (this.selectedProjectForBurnup && this.selectedProjectForBurnup.id === projectId) {
        this.updateProjectBurnup(this.selectedProjectForBurnup);
      }
      this.updateGanttChart(); // ここで必ず呼ぶ
      this.cdr.markForCheck();
    });
  }

  // allTasksからprojectIdでタスクを絞り込むメソッド
  getTasksByProjectId(projectId: string): Task[] {
    return this.projectTasks[projectId!] || [];
  }

  onBurnupProjectChange() {
    let selected: Project | SubProject | null = null;
    if (this.selectedProjectForBurnupId) {
      if (this.selectedProjectForBurnupId.startsWith('sub-')) {
        // サブプロジェクトID
        const subId = this.selectedProjectForBurnupId.replace('sub-', '');
        // currentSubProjects から探す
        selected = this.currentSubProjects.find((sp: any) => sp.id === subId) || null;
      } else {
        // 通常のプロジェクトID
        selected = this.projects.find(p => p.id === this.selectedProjectForBurnupId) || null;
      }
    }
    this.selectedProjectForBurnup = selected;
    this.updateProjectBurnup(this.selectedProjectForBurnup);
  }

  addSubProjectToBigProject(bigProjectId: string, subProjectData: any) {
    this.projectService.addSubProject(bigProjectId, subProjectData)
      .then(() => {
        this.resetSubProjectForm(bigProjectId);
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへのサブプロジェクト追加に失敗: ' + err.message);
        console.error(err);
      });
  }

  updateSubProject(bigProjectId: string, subProjectId: string, data: any) {
    this.projectService.updateSubProject(bigProjectId, subProjectId, data)
      .then(() => {
        this.editingSubProject = null;
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreへのサブプロジェクト更新に失敗: ' + err.message);
        console.error(err);
      });
  }

  deleteSubProject(bigProjectId: string, subProjectId: string) {
    if (!confirm('このサブプロジェクトを削除してもよろしいですか？')) return;
    this.projectService.deleteSubProject(bigProjectId, subProjectId)
      .then(() => {
        alert('サブプロジェクトを削除しました');
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreからのサブプロジェクト削除に失敗: ' + err.message);
        console.error(err);
      });
  }

  // サブタスク購読
  subscribeSubTasks(bigProjectId: string, subProjectId: string) {
    // 既存の購読があれば解除
    if (this.subTasksSubscriptions[subProjectId]) {
      this.subTasksSubscriptions[subProjectId].unsubscribe();
    }
    this.subTasksSubscriptions[subProjectId] = this.projectService.getSubTasks(bigProjectId, subProjectId).subscribe(subTasks => {
      this.currentSubTasksMap[subProjectId] = subTasks.map(t => ({
        ...t,
        subProjectId
      }));
      // ボードリスト再計算
      this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
      this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
      this.boardTasksCompleted = this.getAllTasksByStatus('completed');
      this.cdr.detectChanges(); // 強制UI更新
      this.updateBigProjectProgress(bigProjectId);
      this.updateGanttChart();
      if (
        this.selectedProjectForBurnup &&
        this.selectedProjectForBurnup.id === subProjectId
      ) {
        this.updateProjectBurnup(this.selectedProjectForBurnup);
      }
    });
  }

  showSubTaskCreateForm(subProjectId: string) {
    this.showSubTaskForm[subProjectId] = true;
    this.newSubTask[subProjectId] = { title: '', description: '', status: 'not-started', assignee: '' };
    this.cdr.markForCheck();
  }

  resetSubTaskForm(subProjectId: string) {
    this.showSubTaskForm[subProjectId] = false;
    this.newSubTask[subProjectId] = { title: '', description: '', status: 'not-started', assignee: '' };
    this.cdr.markForCheck();
  }

  createSubTask(bigProjectId: string, subProjectId: string) {
    const task = this.newSubTask[subProjectId];
    if (!task.title) {
      alert('タスク名は必須です');
      return;
    }
    if (!task.startDate || !task.endDate) {
      alert('期間（開始日・終了日）は必須です');
      return;
    }
    // 完了日がある場合、終了日より後は不可
    const endDate = new Date(task.endDate);
    if (task.completedDate) {
      const completed = new Date(task.completedDate);
      if (completed > endDate) {
        alert('完了日は終了日より後に設定できません');
        return;
      }
    }
    this.projectService.addSubTask(bigProjectId, subProjectId, {
      ...task,
      subProjectId // ← 必ずセット
    })
      .then(() => {
        this.resetSubTaskForm(subProjectId);
        this.subscribeSubTasks(bigProjectId, subProjectId);
        this.updateBigProjectProgress(bigProjectId);
      })
      .catch(err => {
        alert('Firestoreへのサブタスク追加に失敗: ' + err.message);
        console.error(err);
      });
  }

  editSubTask(bigProjectId: string, subProjectId: string, subTask: any) {
    // ディープコピーせず、リストの実体を直接参照
    this.editingSubTask = { bigProjectId, subProjectId, subTask };
    this.cdr.markForCheck();
  }

  saveSubTaskEdit() {
    if (!this.editingSubTask) return;
    const { bigProjectId, subProjectId, subTask } = this.editingSubTask;

    // 必須項目チェック
    if (!subTask.title) {
      alert('サブタスク名は必須です');
      return;
    }
    if (subTask.startDate && subTask.endDate) {
      const startDate = new Date(subTask.startDate);
      const endDate = new Date(subTask.endDate);
      if (endDate < startDate) {
        alert('終了日は開始日より後に設定してください');
        return;
      }
      // 完了日がある場合、終了日より後は不可
      if (subTask.completedDate) {
        const completed = new Date(subTask.completedDate);
        if (completed > endDate) {
          alert('完了日は終了日より後に設定できません');
          return;
        }
      }
    }

    // Firestoreに送信
    this.projectService.updateSubTask(bigProjectId, subProjectId, subTask.id, subTask)
      .then(() => {
        // 最新データで上書き
        this.subscribeSubTasks(bigProjectId, subProjectId);
        // 編集状態を解除
        this.editingSubTask = null;
        // ボード用リストも再計算
        this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
        this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
        this.boardTasksCompleted = this.getAllTasksByStatus('completed');
        // 強制的に変更検知
        this.cdr.detectChanges();
      })
      .catch(err => {
        alert('Firestoreへのサブタスク更新に失敗: ' + JSON.stringify(err));
        console.error(err);
      });
  }

  cancelSubTaskEdit() {
    this.editingSubTask = null;
    this.cdr.markForCheck();
  }

  deleteSubTask(bigProjectId: string, subProjectId: string, subTaskId: string) {
    console.log('[deleteSubTask] called', { bigProjectId, subProjectId, subTaskId });
    if (!confirm('このサブタスクを削除してもよろしいですか？')) return;
    this.projectService.deleteSubTask(bigProjectId, subProjectId, subTaskId)
      .then(() => {
        alert('サブタスクを削除しました');
        // 即時UIから除去
        if (this.currentSubTasksMap[subProjectId]) {
          this.currentSubTasksMap[subProjectId] = this.currentSubTasksMap[subProjectId].filter(t => t.id !== subTaskId);
        }
        this.ganttTasks = this.ganttTasks.filter(t => t.id !== subTaskId);
        this.subscribeSubTasks(bigProjectId, subProjectId);
        this.updateBigProjectProgress(bigProjectId);
        // ボードリスト再計算
        this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
        this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
        this.boardTasksCompleted = this.getAllTasksByStatus('completed');
        this.cdr.markForCheck();
      })
      .catch(err => {
        alert('Firestoreからのサブタスク削除に失敗: ' + err.message);
        console.error(err);
      });
  }

  getSubProjectProgressWithSubTasks(subProject: any): number {
    const tasks = this.currentSubTasksMap && this.currentSubTasksMap[subProject.id]
      ? this.currentSubTasksMap[subProject.id]
      : (subProject.tasks || []);
    if (!tasks.length) return 0;
    const completed = tasks.filter((t: any) => t.status === 'completed').length;
    return Math.round((completed / tasks.length) * 100);
  }

  onGanttTargetChange() {
    this.updateGanttChart();
  }

  get selectedGanttTargetName(): string {
    if (!this.selectedGanttTargetId) return 'ガントチャート';
    if (this.selectedGanttTargetId.startsWith('project-')) {
      const project = this.projects.find(p => 'project-' + p.id === this.selectedGanttTargetId);
      return project?.name || 'ガントチャート';
    }
    if (this.selectedGanttTargetId.startsWith('sub-')) {
      // サブプロジェクトを全て集めて検索
      const allSubProjects = Object.values(this.currentSubProjectsMap).flat();
      const subProject = allSubProjects.find(sp => 'sub-' + sp.id === this.selectedGanttTargetId);
      return subProject?.name || 'ガントチャート';
    }
    return 'ガントチャート';
  }

  // 1. サブプロジェクトの全タスク取得用の共通メソッドを追加
  getAllSubProjectTasks(subProject: SubProject): SubProjectTask[] {
    const subTasks = this.currentSubTasksMap[subProject.id] || [];
    return [...(subProject.tasks || []), ...subTasks];
  }

  // 2. サブプロジェクト進捗計算も共通化
  getSubProjectProgressWithAllTasks(subProject: SubProject): number {
    const allTasks = this.getAllSubProjectTasks(subProject);
    if (!allTasks || !allTasks.length) return 0;
    const completed = allTasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / allTasks.length) * 100);
  }

  getBurndownPolylinePoints(data: BurnupData[]): string {
    if (!data || data.length === 0) return '';
    const n = data.length;
    return data.map((d, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 100 - d.completedTasks;
      return `${x},${y}`;
    }).join(' ');
  }

  onTaskStatusChange(task: Task | SubProjectTask, projectId: string) {
    // サブタスク編集フォームが開いている場合は何もしない
    if (this.editingSubTask && this.editingSubTask.subTask.id === task.id) return;
    if (task.status === 'completed' && !task.completedDate) {
      this.showCompleteDateWarning = true;
      this.lastTaskToRevert = { task, projectId };
      return;
    }
    if (this.isSubProjectTask(task)) {
      // サブタスクはFirestore更新のみ。UI再計算は購読で行う
      const subProjectId = (task as any).subProjectId;
      const subTaskId = (task as any).id;
      const updateData = { ...task, completedDate: task.completedDate ?? null };
      this.projectService.updateSubTask(projectId, subProjectId, subTaskId, updateData)
        .then(() => {
          // すべての要素を新規ロード時と同じように再取得
          this.reloadAllDataForBoard();
        })
        .catch(err => {
          alert('Firestoreへのサブタスク更新に失敗: ' + err.message);
          console.error(err);
        });
    } else {
      // 通常タスクは従来通り
      this.updateTaskStatus(task);
      if (this.currentView === 'board') {
        this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
        this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
        this.boardTasksCompleted = this.getAllTasksByStatus('completed');
        this.cdr.markForCheck();
      }
    }
  }

  onTaskCompletedDateChange(task: Task | SubProjectTask, projectId: string) {
    // サブタスク編集フォームが開いている場合は何もしない
    if (this.editingSubTask && this.editingSubTask.subTask.id === task.id) return;
    console.log('onTaskCompletedDateChange呼び出し', task, projectId);
    console.log('isSubProjectTask:', this.isSubProjectTask(task), task);
    // 完了日が入力されたらステータスも完了にする
    if (task.completedDate && task.status !== 'completed') {
      task.status = 'completed';
    }
    // 完了日が終了日より後は不可
    if (task.completedDate && task.endDate) {
      const completed = new Date(task.completedDate);
      const endDate = new Date(task.endDate);
      if (completed > endDate) {
        alert('完了日は終了日より後に設定できません');
        task.completedDate = task.endDate; // または '' でリセット
        this.cdr.markForCheck();
        return;
      }
    }
    if (task.status === 'completed' && !task.completedDate) {
      this.showCompleteDateWarning = true;
      this.lastTaskToRevert = { task, projectId };
      return;
    }
    this.updateTaskStatus(task);
    // サブタスクの場合はDBに即時反映（saveSubTaskEditのロジックを参照）
    if (this.isSubProjectTask(task)) {
      const subProjectId = (task as any).subProjectId;
      const subTaskId = (task as any).id;
      console.log('DBに送信', { bigProjectId: projectId, subProjectId, subTaskId, task });
      // undefinedをnullに変換して送信
      const updateData = { ...task, completedDate: task.completedDate ?? null };
      this.projectService.updateSubTask(projectId, subProjectId, subTaskId, updateData)
        .then(() => {
          this.subscribeSubTasks(projectId, subProjectId);
          this.updateBigProjectProgress(projectId);
        })
        .catch(err => {
          alert('Firestoreへのサブタスク更新に失敗: ' + err.message);
          console.error(err);
        });
    }
    if (this.currentView === 'board') {
      this.boardTasksNotStarted = this.getAllTasksByStatus('not-started');
      this.boardTasksInProgress = this.getAllTasksByStatus('in-progress');
      this.boardTasksCompleted = this.getAllTasksByStatus('completed');
      this.cdr.markForCheck();
    }
  }

  closeCompleteDateWarning() {
    if (this.lastTaskToRevert) {
      this.lastTaskToRevert.task.status = 'not-started';
      this.lastTaskToRevert = null;
    }
    this.showCompleteDateWarning = false;
    this.cdr.markForCheck();
  }

  // バーンダウンチャートSVG用のX座標計算（日付の差分に基づく）
  getBurndownCircleX(i: number): number {
    // ラベルの日付リスト（開始日＋完了日＋終了日）
    const dates: string[] = [
      this.selectedProjectForBurnup?.startDate,
      ...this.getAllTaskCompletedDates(),
      this.selectedProjectForBurnup?.endDate
    ].filter(Boolean) as string[];
    if (dates.length <= 1) return 70;
    // 日付をDate型に変換
    const dateObjs = dates.map(d => new Date(d));
    const minDate = dateObjs[0].getTime();
    const maxDate = dateObjs[dateObjs.length - 1].getTime();
    const totalSpan = maxDate - minDate;
    if (totalSpan === 0) return 70;
    // i番目の日付のX座標を計算
    const current = dateObjs[i].getTime();
    const ratio = (current - minDate) / totalSpan;
    return 70 + ratio * (270 - 70);
  }
  // バーンダウンチャートSVG用のY座標計算
  getBurndownCircleY(point: any): number {
    if (!point || !point.plannedTasks) return 100;
    return 100 - Math.round((point.completedTasks / point.plannedTasks) * 80);
  }
  // 折れ線グラフのpoints属性生成
  getBurndownSvgPoints(): string {
    return this.burnupData.map((point, i) => `${this.getBurndownCircleX(i)},${this.getBurndownCircleY(point)}`).join(' ');
  }

  // すべてのタスクの完了日（重複なし・昇順）を返す
  getAllTaskCompletedDates(): string[] {
    let tasks: any[] = [];
    if (this.selectedProjectForBurnup) {
      if (this.isSubProject(this.selectedProjectForBurnup)) {
        tasks = this.selectedProjectForBurnup.tasks || [];
      } else {
        tasks = this.getProjectTasks(this.selectedProjectForBurnup.id!);
      }
    }
    // 完了日があるタスクのみ抽出し、重複を除いて昇順で返す
    const dates = tasks
      .filter(t => t.completedDate)
      .map(t => t.completedDate)
      .filter((date, i, arr) => arr.indexOf(date) === i)
      .sort();
    return dates;
  }

  // 横軸ラベルが重ならないよう最低マージンを空けて返す
  getXAxisLabelsWithMargin(): { date: string, x: number }[] {
    // ラベルの日付リスト（開始日＋完了日＋終了日）
    const dates: string[] = [
      this.selectedProjectForBurnup?.startDate,
      ...this.getAllTaskCompletedDates(),
      this.selectedProjectForBurnup?.endDate
    ].filter(Boolean) as string[];
    if (dates.length <= 1) return [{ date: dates[0], x: 70 }];
    // 日付をDate型に変換
    const dateObjs = dates.map(d => new Date(d));
    const minDate = dateObjs[0].getTime();
    const maxDate = dateObjs[dateObjs.length - 1].getTime();
    const totalSpan = maxDate - minDate;
    const minMargin = 12; // px
    const xStart = 70;
    const xEnd = 270;
    const width = xEnd - xStart;
    let lastX = -Infinity;
    return dateObjs.map((dateObj, i) => {
      const ratio = totalSpan === 0 ? 0 : (dateObj.getTime() - minDate) / totalSpan;
      let x = xStart + ratio * width;
      // 最低マージンを確保
      if (x - lastX < minMargin) {
        x = lastX + minMargin;
      }
      lastX = x;
      return { date: dates[i], x };
    });
  }

  /**
   * バーンダウンチャート用の進捗率バー（縦棒グラフ）データを返す
   * 各タスクの完了日ごとに、進捗率（タスク数/100）と日付（yyyy/mm/dd）を返す
   * @returns {Array<{date: string, progress: number, label: string}>}
   */
  getBurndownProgressBars(): { date: string, progress: number, label: string }[] {
    if (!this.selectedProjectForBurnup) return [];
    const tasks = this.isSubProject(this.selectedProjectForBurnup)
      ? [
          ...((this.selectedProjectForBurnup as any).tasks || []),
          ...(this.currentSubTasksMap[(this.selectedProjectForBurnup as any).id] || [])
        ]
      : this.getProjectTasks(this.selectedProjectForBurnup.id!);
    console.log('[Burndown][getBurndownProgressBars] tasks =', tasks);
    if (!tasks.length) return [];
    const total = tasks.length;
    // 完了タスクのみ抽出し、完了日で昇順ソート
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedDate)
      .sort((a, b) => (a.completedDate! > b.completedDate! ? 1 : -1));
    let completedCount = 0;
    const bars: { date: string, progress: number, label: string }[] = [];
    completedTasks.forEach(t => {
      completedCount++;
      // 進捗率は completedCount / total * 100
      const progress = Math.round((completedCount / total) * 100);
      // 日付を yyyy/mm/dd 形式に
      const dateObj = new Date(t.completedDate!);
      const label = `${dateObj.getFullYear()}/${('0' + (dateObj.getMonth() + 1)).slice(-2)}/${('0' + dateObj.getDate()).slice(-2)}`;
      bars.push({ date: t.completedDate!, progress, label });
    });
    return bars;
  }

  /**
   * SVGの幅を返す（バーの数×36px、最低320px）
   */
  getBurndownBarChartWidth(): number {
    return Math.max(this.getBurndownProgressBars().length * 36, 320);
  }

  /**
   * バーンダウンバーのラベルとX座標を計算して返す
   * - プロジェクト開始日・終了日を横軸両端に
   * - タスク完了日はその日付に比例した位置
   * - 最低マージンを確保して重なり防止
   */
  getBurndownBarChartLabelsAndPositions(isForWidthCalc: boolean = false): { label: string, x: number, progress: number, date: string }[] {
    if (!this.selectedProjectForBurnup) return [];
    const bars = this.getBurndownProgressBars();
    if (!bars.length) return [];
    // SVG横幅を取得（なければ1200px）
    let svgWidth = 1200;
    if (!isForWidthCalc && this.barChartContainerRef && this.barChartContainerRef.nativeElement) {
      svgWidth = this.barChartContainerRef.nativeElement.clientWidth || 1200;
    } else if (isForWidthCalc) {
      svgWidth = this.getBarChartSvgWidth(true);
    }
    const xStart = 40;
    const xEnd = svgWidth - 40;
    // 日付リスト: 開始日, 各完了日, 終了日
    const startDateStr = this.selectedProjectForBurnup.startDate;
    const endDateStr = this.selectedProjectForBurnup.endDate;
    const dateList = [startDateStr, ...bars.map(b => b.date), endDateStr]
      .filter((d): d is string => !!d)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const labelList = dateList.map(d => {
      const dateObj = new Date(d);
      return `${('0' + (dateObj.getMonth() + 1)).slice(-2)}/${('0' + dateObj.getDate()).slice(-2)}`;
    });
    const dateObjs = dateList.map(d => new Date(d));
    let minDate = dateObjs[0].getTime();
    let maxDate = dateObjs[dateObjs.length - 1].getTime();
    let totalSpan = maxDate - minDate;
    // 期間が1日（minDate == maxDate）の場合は強制的にspanを1日にする
    if (totalSpan === 0) {
      maxDate = minDate + 24 * 60 * 60 * 1000;
      totalSpan = maxDate - minDate;
    }
    let lastX = -Infinity;
    const result: { label: string, x: number, progress: number, date: string }[] = [];
    for (let i = 0; i < dateObjs.length; i++) {
      const ratio = (dateObjs[i].getTime() - minDate) / totalSpan;
      let x = xStart + ratio * (xEnd - xStart);
      // 最後の点（終了日）は必ず右端にする
      if (i === dateObjs.length - 1) {
        x = xEnd;
      }
      // 最低マージン
      const minMargin = 28; // px
      if (x - lastX < minMargin) {
        x = lastX + minMargin;
      }
      lastX = x;
      let progress = 0;
      if (i === 0) progress = 0;
      else if (i === dateObjs.length - 1) progress = 100;
      else progress = bars[i - 1]?.progress ?? 0;
      result.push({ label: labelList[i], x, progress, date: dateList[i] });
    }
    return result;
  }

  /**
   * バーンダウンチャートの青い実績線（左下→各バー頂点）を描画するためのpoints文字列を返す
   * - 左下（x=40, y=170）→各バー頂点（item.x, 170-(item.progress*1.3)）
   * - 最初と最後（開始日・終了日）は除外
   */
  getBurndownActualPolylinePoints(): string {
    const points: string[] = [];
    const items = this.getBurndownBarChartLabelsAndPositions();
    if (!items.length) return '';
    // 左下スタート
    points.push('40,170');
    // 各バー頂点（開始日・終了日は除外）
    for (let i = 1; i < items.length - 1; i++) {
      const item = items[i];
      points.push(`${item.x},${170 - (item.progress * 1.3)}`);
    }
    return points.join(' ');
  }

  getProjectStartDate(projectId: string): string {
    const project = this.projects.find(p => p.id === projectId);
    return project?.startDate || '';
  }

  getProjectEndDate(projectId: string): string {
    const project = this.projects.find(p => p.id === projectId);
    return project?.endDate || '';
  }

  getSubProjectStartDate(subProjectId: string): string {
    for (const bigProject of this.bigProjects) {
      const subProject = bigProject.subProjects?.find(sp => sp.id === subProjectId);
      if (subProject) return subProject.startDate || '';
    }
    return '';
  }
  getSubProjectEndDate(subProjectId: string): string {
    for (const bigProject of this.bigProjects) {
      const subProject = bigProject.subProjects?.find(sp => sp.id === subProjectId);
      if (subProject) return subProject.endDate || '';
    }
    return '';
  }

  // ガントチャート上の削除ボタン用
  onGanttTaskDelete(task: GanttTask) {
    // まずcurrentSubTasksMapからサブタスクを探す
    for (const [subProjectId, subTasks] of Object.entries(this.currentSubTasksMap)) {
      const found = subTasks.find((t: any) => t.id === task.id);
      if (found) {
        // サブプロジェクトID→ビッグプロジェクトIDを特定
        const subProject = this.currentSubProjects.find(sp => sp.id === subProjectId);
        const bigProjectId = subProject?.bigProjectId;
        if (bigProjectId) {
          this.deleteSubTask(bigProjectId, subProjectId, task.id);
          return;
        }
      }
    }
    // 通常タスクの場合
    const projectId = this.getTaskProperty(task, 'projectId');
    if (projectId) {
      this.deleteTask(task.id, projectId);
      return;
    }
    alert('削除対象のタスク情報が取得できません');
  }

  // --- Burnup系の関数・プロパティを追加 ---
  getBurnupBarChartLabelsAndPositions(isForWidthCalc: boolean = false): { label: string, x: number, progress: number, date: string }[] {
    return this.getBurndownBarChartLabelsAndPositions(isForWidthCalc);
  }

  getBurnupActualPolylinePoints(): string {
    const points: string[] = [];
    const items = this.getBurnupBarChartLabelsAndPositions();
    if (!items.length) return '';
    // 左下スタート（y=340）
    points.push('40,340');
    // 各バー頂点（開始日・終了日は除外）
    for (let i = 1; i < items.length - 1; i++) {
      const item = items[i];
      // Y座標: 340 - (progress * 2.6)
      points.push(`${item.x},${340 - (item.progress * 2.6)}`);
    }
    return points.join(' ');
  }

  getBurnupProgressBars(): { date: string, progress: number, label: string }[] {
    return this.getBurndownProgressBars();
  }

  getBurnupBarChartWidth(): number {
    return this.getBurndownBarChartWidth();
  }

  getBurnupCircleX(i: number): number {
    return this.getBurndownCircleX(i);
  }

  getBurnupCircleY(point: any): number {
    return this.getBurndownCircleY(point);
  }

  getBurnupSvgPoints(): string {
    return this.getBurndownSvgPoints();
  }

  getBurnupPolylinePoints(data: any[]): string {
    return this.getBurndownPolylinePoints(data);
  }
  // --- 既存burndown系の関数・プロパティはburnup系で参照するように統一 ---

  ngOnDestroy() {
    Object.values(this.subTasksSubscriptions).forEach(sub => sub.unsubscribe());
  }

  // バーンアップチャート用: タスク数を返す
  getBurnupTaskCount(): number {
    if (!this.selectedProjectForBurnup) return 0;
    if (this.isSubProject(this.selectedProjectForBurnup)) {
      // サブプロジェクト
      const subProject = this.selectedProjectForBurnup as any;
      const tasks1 = subProject.tasks || [];
      const tasks2 = this.currentSubTasksMap[subProject.id] || [];
      return tasks1.length + tasks2.length;
    } else {
      // 通常プロジェクト
      return this.getProjectTasks(this.selectedProjectForBurnup.id!).length;
    }
  }

  // バーンアップチャート用: 完了タスク数を返す
  getBurnupCompletedTaskCount(): number {
    if (!this.selectedProjectForBurnup) return 0;
    let tasks: any[] = [];
    if (this.isSubProject(this.selectedProjectForBurnup)) {
      const subProject = this.selectedProjectForBurnup as any;
      const tasks1 = subProject.tasks || [];
      const tasks2 = this.currentSubTasksMap[subProject.id] || [];
      tasks = [...tasks1, ...tasks2];
    } else {
      tasks = this.getProjectTasks(this.selectedProjectForBurnup.id!);
    }
    return tasks.filter(t => t.status === 'completed').length;
  }

  reloadAllDataForBoard() {
    // プロジェクト・タスク・ビッグプロジェクト・サブプロジェクト・サブタスクを全て再購読
    this.projects$ = this.projectService.getProjects();
    this.projects$.subscribe(projects => {
      this.projects = projects;
      projects.forEach(project => {
        if (project.id) {
          this.subscribeTasks(project.id);
        }
      });
      this.cdr.markForCheck();
    });

    this.bigProjects$ = this.projectService.getBigProjects();
    this.bigProjects$.subscribe(bigProjects => {
      this.bigProjects = bigProjects;
      bigProjects.forEach(bp => {
        this.projectService.getSubProjects(bp.id).subscribe(subProjects => {
          const subProjectsWithParent = subProjects.map(sp => ({
            ...sp,
            bigProjectId: bp.id,
            bigProjectName: bp.name
          }));
          this.currentSubProjectsMap[bp.id] = subProjectsWithParent;
          // 全サブプロジェクトを集約
          const allSubProjects: any[] = [];
          Object.values(this.currentSubProjectsMap).forEach(list => allSubProjects.push(...list));
          this.currentSubProjects = allSubProjects;
          // サブプロジェクトごとにサブタスク購読
          subProjectsWithParent.forEach((sp: any) => {
            this.subscribeSubTasks(bp.id, sp.id);
          });
          this.cdr.markForCheck();
        });
      });
    });
  }
}