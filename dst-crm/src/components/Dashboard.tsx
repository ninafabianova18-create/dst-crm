import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { ImportStudents } from './ImportStudents';
import { AllowedEmails } from './AllowedEmails';
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
  const [adminTab, setAdminTab] = useState<'import' | 'communication' | 'students'| 'emails' | 'payments' | 'users' | 'statistics'>('import');
  const { user, role, isAdmin, isTeam } = useAuth();
  const [dashboardName, setDashboardName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
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
          console.error('Chyba pri načítaní mena študenta:', error);
        }

        setDashboardName(user.email.split('@')[0]);
        return;
      }

      setDashboardName('Používateľ');
    };

    resolveDashboardName();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Chyba pri odhlášení:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Vitajte, {dashboardName || 'Používateľ'}</h1>
          <div className="user-info">
            <span className={`role-badge ${role}`}>
              {role === 'admin' ? 'Administrátor' : role === 'team' ? 'Team' : 'Študent'}
            </span>
            {user?.photoURL && (
              <img src={user.photoURL} alt={user.displayName || 'Profil'} className="user-avatar" />
            )}
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">Odhlásiť sa</button>
        


      </header>

      <main className="dashboard-main">
        {isAdmin ? (
          <div className="admin-section">
            <div className="admin-tabs">
              
              <button
                className={`tab-btn ${adminTab === 'import' ? 'active' : ''}`}
                onClick={() => setAdminTab('import')}
              >
                Import
              </button>
              <button
                className={`tab-btn ${adminTab === 'emails' ? 'active' : ''}`}
                onClick={() => setAdminTab('emails')}
              >
                Povolené emaily
              </button>
              <button
                className={`tab-btn ${adminTab === 'users' ? 'active' : ''}`}
                onClick={() => setAdminTab('users')}
              >
                Správa užívateľov
              </button>
              <button
                className={`tab-btn ${adminTab === 'students' ? 'active' : ''}`}
                onClick={() => setAdminTab('students')}
              >
                Správa študentov
              </button>
              <button
                className={`tab-btn ${adminTab === 'payments' ? 'active' : ''}`}
                onClick={() => setAdminTab('payments')}
              >
                Správa platieb
              </button>
              <button
                className={`tab-btn ${adminTab === 'communication' ? 'active' : ''}`}
                onClick={() => setAdminTab('communication')}
              >
                Komunikácia a kontrola
              </button>
              <button
                className={`tab-btn ${adminTab === 'statistics' ? 'active' : ''}`}
                onClick={() => setAdminTab('statistics')}
              >
                Štatistiky
              </button>
            </div>
            {adminTab === 'import' && <ImportStudents />}
            {adminTab === 'emails' && <AllowedEmails />}
            {adminTab === 'users' && <UsersManagement />}
            {adminTab === 'payments' && <PaymentsManagement />}
            {adminTab === 'students' && <StudentsManagement />}
            {adminTab === 'communication' && <Communication />}
            {adminTab === 'statistics' && <Statistics />}
          </div>
        ) : isTeam ? (
          <div className="team-section">
            <Statistics />
          </div>
        ) : (
          <UserProfile />
        )}
      </main>
    </div>
  );
};
