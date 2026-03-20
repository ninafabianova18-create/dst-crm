import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { ImportStudents } from './ImportStudents';
import { UsersManagement } from './UsersManagement';
import { useEffect, useState } from 'react';
import '../styles/Dashboard.css';
import { UserProfile } from './UserProfile';
import PaymentsManagement from './PaymentsManagement';
import StudentsManagement from './StudentsManagement';
import Communication from './Communacation';
import { Statistics } from './Statistics';                                                              
import { db } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';



export const Dashboard = () => {
  // Active admin tab UI state: idiomatic React pattern with a single source of UI truth.
  const [adminTab, setAdminTab] = useState<'import' | 'communication' | 'students' | 'payments' | 'users' | 'statistics'>('import');
  const { user, role, isAdmin, isTeam } = useAuth();
  const [dashboardName, setDashboardName] = useState('');
  const [studentNoteReminderCount, setStudentNoteReminderCount] = useState(0);
  const [globalCohort, setGlobalCohort] = useState('all');
  const [globalInstallmentCheckpoint, setGlobalInstallmentCheckpoint] = useState(1);
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const navigate = useNavigate();

  const getCohortFromVS = (vs?: string) => {
    const clean = String(vs ?? '').trim();
    if (clean.length < 4) return '';
    return clean.slice(0, 4);
  };

  useEffect(() => {
    // Effect pattern: derive the display name with fallbacks (displayName -> students -> email).
    const resolveDashboardName = async () => {
      if (!user) {
        setDashboardName('');
        return;
      }

      if (user.displayName?.trim()) {
        setDashboardName(user.displayName.trim());
        return;
      }

      if (user.email) {
        try {
          const studentQ = query(
            collection(db, 'students'),
            where('mail', '==', user.email)
          );
          const studentSnap = await getDocs(studentQ);

          if (!studentSnap.empty) {
            const studentData = studentSnap.docs[0].data() as {
              name?: string;
              surname?: string;
            };
            const fullName = `${studentData.name ?? ''} ${studentData.surname ?? ''}`.trim();

            if (fullName) {
              setDashboardName(fullName);
              return;
            }
          }
        } catch (error) {
          console.error('Error loading student name:', error);
        }

        setDashboardName(user.email.split('@')[0]);
        console.log('/////////////////////No displayName or email available for user:', role);
   
        return;
      }
      setDashboardName('Používateľ'); // EN: User
    };
    resolveDashboardName();
  }, [user]);

  useEffect(() => {
    const loadStudentNoteReminders = async () => {
      if (!isAdmin) {
        setStudentNoteReminderCount(0);
        return;
      }

      try {
        const remindersQ = query(
          collection(db, 'students'),
          where('noteNeedsReview', '==', true)
        );
        const remindersSnap = await getDocs(remindersQ);
        setStudentNoteReminderCount(remindersSnap.size);
      } catch (error) {
        console.error('Error loading student note reminders:', error);
      }
    };

    loadStudentNoteReminders();
  }, [isAdmin, adminTab]);

  useEffect(() => {
    const loadCohorts = async () => {
      try {
        const studentsSnap = await getDocs(collection(db, 'students'));
        const values = new Set<string>();
        studentsSnap.forEach((d) => {
          const data = d.data() as any;
          const cohort = getCohortFromVS(data.vs);
          if (cohort) values.add(cohort);
        });
        setCohortOptions(Array.from(values).sort((a, b) => Number(b) - Number(a)));
      } catch (error) {
        console.error('Error loading cohort options:', error);
      }
    };

    loadCohorts();
  }, []);

  const handleLogout = async () => {
    try {
      // Explicit signOut + programmatic navigation via useNavigate.
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  };

  const cohortLabel = (cohort: string) => {
    if (!cohort || cohort === 'all') return 'Všetky ročníky'; // EN: All cohorts
    const cls = cohort.slice(2, 4);
    return `${cohort} (trieda ${Number(cls)}.)`;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Vitajte, {dashboardName || 'Používateľ'} {/* EN: Welcome, ... */}</h1>
          <div className="user-info">
            <span className={`role-badge ${role}`}>
              {role === 'admin' ? 'Administrátor' /* EN: Administrator */ : role === 'team' ? 'Team' : 'Študent' /* EN: Student */}
            </span>
            {user?.photoURL && (
              <img src={user.photoURL} alt={user.displayName || 'Profil'} className="user-avatar" />
            )}
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">Odhlásiť sa {/* EN: Sign out */}</button>
        


      </header>

      <main className="dashboard-main">
        {/* Role-based conditional rendering */}
        {isAdmin ? (
          <div className="admin-section">
            <div className="global-cohort-row">
              <span>Globálny ročník: {/* EN: Global cohort */}</span>
              <select
                className="global-cohort-select"
                value={globalCohort}
                onChange={(e) => setGlobalCohort(e.target.value)}
              >
                <option value="all">Všetky ročníky {/* EN: All cohorts */}</option>
                {cohortOptions.map((cohort) => (
                  <option key={cohort} value={cohort}>{cohortLabel(cohort)}</option>
                ))}
              </select>
              {globalCohort !== 'all' && <span className="global-cohort-current">Aktívne: {cohortLabel(globalCohort)} {/* EN: Active */}</span>}
            </div>

            <div className="admin-tabs">
              
              <button
                className={`tab-btn ${adminTab === 'import' ? 'active' : ''}`}
                onClick={() => setAdminTab('import')}
              >
                Import
              </button>
              <button
                className={`tab-btn ${adminTab === 'users' ? 'active' : ''}`}
                onClick={() => setAdminTab('users')}
              >
                Správa užívateľov {/* EN: User management */}
              </button>
              <button
                className={`tab-btn ${adminTab === 'students' ? 'active' : ''}`}
                onClick={() => setAdminTab('students')}
              >
                Správa študentov {/* EN: Student management */}
                {studentNoteReminderCount > 0 && (
                  <span className="tab-reminder-badge" title="Nové poznámky od študentov">
                    {studentNoteReminderCount}
                  </span>
                )}
              </button>
              <button
                className={`tab-btn ${adminTab === 'payments' ? 'active' : ''}`}
                onClick={() => setAdminTab('payments')}
              >
                Správa platieb {/* EN: Payments management */}
              </button>
              <button
                className={`tab-btn ${adminTab === 'communication' ? 'active' : ''}`}
                onClick={() => setAdminTab('communication')}
              >
                Komunikácia a kontrola {/* EN: Communication and control */}
              </button>
              <button
                className={`tab-btn ${adminTab === 'statistics' ? 'active' : ''}`}
                onClick={() => setAdminTab('statistics')}
              >
                Štatistiky {/* EN: Statistics */}
              </button>
            </div>
            {adminTab === 'import' && <ImportStudents />}
            {adminTab === 'users' && <UsersManagement />}
            {adminTab === 'payments' && <PaymentsManagement selectedCohort={globalCohort} />}
            {adminTab === 'students' && (
              <StudentsManagement onRemindersChanged={setStudentNoteReminderCount} selectedCohort={globalCohort} />
            )}
            {adminTab === 'communication' && (
              <Communication
                selectedCohort={globalCohort}
                selectedInstallmentCheckpoint={globalInstallmentCheckpoint}
                onSelectedInstallmentCheckpointChange={setGlobalInstallmentCheckpoint}
              />
            )}
            {adminTab === 'statistics' && (
              <Statistics
                selectedCohort={globalCohort}
                onSelectedCohortChange={setGlobalCohort}
                selectedInstallmentCheckpoint={globalInstallmentCheckpoint}
                onSelectedInstallmentCheckpointChange={setGlobalInstallmentCheckpoint}
              />
            )}
          </div>
        ) : isTeam ? (
          <div className="team-section">
            <Statistics
              selectedCohort={globalCohort}
              onSelectedCohortChange={setGlobalCohort}
              selectedInstallmentCheckpoint={globalInstallmentCheckpoint}
              onSelectedInstallmentCheckpointChange={setGlobalInstallmentCheckpoint}
            />
          </div>
        ) : (
          <UserProfile />
        )}
      </main>
    </div>
  );
};
