import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { ImportStudents } from './ImportStudents';
import { AllowedEmails } from './AllowedEmails';
//import { PendingRegistrations } from './PendingRegistrations';
import { UsersManagement } from './UsersManagement';
import { useState } from 'react';
import '../styles/Dashboard.css';
import { UserProfile } from './UserProfile';
import PaymentsManagement from './PaymentsManagement';
import StudentsManagement from './StudentsManagement';
import Communication from './Communacation';
import { Statistics } from './Statistics';



export const Dashboard = () => {
  const [adminTab, setAdminTab] = useState<'import' | 'communication' | 'students'| 'emails' | 'payments' | 'pending' | 'users' | 'statistics'>('import');
  const { user, role, isAdmin } = useAuth();
  const navigate = useNavigate();

  //changing email and password
  const [showCreds, setShowCreds] = useState(false);
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [credError, setCredError] = useState('');
  const [credMsg, setCredMsg] = useState('');
  const [credLoading, setCredLoading] = useState(false);

  

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
          <h1>Vitajte, {user?.displayName}</h1>
          <div className="user-info">
            <span className={`role-badge ${role}`}>{role === 'admin' ? 'Administrátor' : 'Užívateľ'}</span>
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
              {/*}
              <button
                className={`tab-btn ${adminTab === 'pending' ? 'active' : ''}`}
                onClick={() => setAdminTab('pending')}
              >
                Čakajúce registrácie
              </button>
              */}
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
                className={`tab-btn ${adminTab === 'payments' ? 'active' : ''}`}
                onClick={() => setAdminTab('payments')}
              >
                Správa platieb
              </button>

              <button
                className={`tab-btn ${adminTab === 'communication' ? 'active' : ''}`}
                onClick={() => setAdminTab('communication')}
              >
                Komunikácia
              </button>

              <button
                className={`tab-btn ${adminTab === 'students' ? 'active' : ''}`}
                onClick={() => setAdminTab('students')}
              >
                Správa študentov
              </button>

              <button
                className={`tab-btn ${adminTab === 'statistics' ? 'active' : ''}`}
                onClick={() => setAdminTab('statistics')}
              >
                Štatistiky
              </button>
            </div>
            {/*{adminTab === 'pending' && <PendingRegistrations />} */}
            {adminTab === 'import' && <ImportStudents />}
            {adminTab === 'emails' && <AllowedEmails />}
            {adminTab === 'users' && <UsersManagement />}
            {adminTab === 'payments' && <PaymentsManagement />}
            {adminTab === 'students' && <StudentsManagement />}
            {adminTab === 'communication' && <Communication />}
            {adminTab === 'statistics' && <Statistics />}
          </div>
        ) : (
          <UserProfile />
        )}
      </main>
    </div>
  );
};
