import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import '../styles/UsersManagement.css';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'student' | 'team';
  createdAt: Date | null;
}

const normalizeRole = (rawRole: unknown): User['role'] => {
  const role = String(rawRole ?? '').toLowerCase().trim();
  if (role === 'admin') return 'admin';
  if (role === 'team') return 'team';
  return 'student';
};

export const UsersManagement = () => {
  // Local state stores: data, loading state, and feedback banner.
  const [users, setUsers] = useState<User[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'team'>('team');
  const [addingUser, setAddingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // One-shot data fetch on mount (no realtime listener / onSnapshot).
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      // Read-all + map transform pattern: Firestore docs -> typed UI model.
      const usersSnapshot = await getDocs(collection(db, 'users'));

      const usersList: User[] = [];
      usersSnapshot.forEach((userDoc) => {
        usersList.push({
          id: userDoc.id,
          email: userDoc.data().email || '',
          displayName: userDoc.data().displayName || '',
          role: normalizeRole(userDoc.data().role),
          createdAt: userDoc.data().createdAt?.toDate ? userDoc.data().createdAt.toDate() : null,
        });
      });

      setUsers(usersList.sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0)));
    } catch (error) {
      console.error('Error loading users:', error);
      // EN: Error while loading users
      setMessage('Chyba pri načítaní užívateľov');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = newUserEmail.trim().toLowerCase();
    if (!email) {
      // EN: Enter email
      setMessage('Zadajte email');
      setMessageType('error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      // EN: Invalid email format
      setMessage('Neplatný email formát');
      setMessageType('error');
      return;
    }

    if (users.some((item) => item.email.toLowerCase() === email)) {
      // EN: User with this email already exists
      setMessage('Používateľ s týmto emailom už existuje');
      setMessageType('error');
      return;
    }

    try {
      setAddingUser(true);
      await addDoc(collection(db, 'users'), {
        email,
        displayName: newUserName.trim(),
        photoURL: '',
        role: newUserRole,
        createdAt: new Date(),
      });

      setNewUserEmail('');
      setNewUserName('');
      setNewUserRole('team');
      // EN: User was added to Firestore
      setMessage('Používateľ bol pridaný do Firestore');
      setMessageType('success');
      await loadUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      // EN: Error while adding user
      setMessage('Chyba pri pridávaní používateľa');
      setMessageType('error');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    // EN: Are you sure you want to remove this user from Firestore?
    const confirmed = window.confirm('Naozaj chcete odstrániť tohto používateľa z Firestore?');
    if (!confirmed) return;

    try {
      setDeletingUserId(id);
      await deleteDoc(doc(db, 'users', id));
      // EN: User was removed from Firestore
      setMessage('Používateľ bol odstránený z Firestore');
      setMessageType('success');
      await loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      // EN: Error while deleting user
      setMessage('Chyba pri mazaní používateľa');
      setMessageType('error');
    } finally {
      setDeletingUserId('');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'student' | 'team') => {
    try {
      // Targeted updateDoc: update only the role field without overwriting the whole document.
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
      });

      const roleLabel = newRole === 'admin' ? 'Administrátor' : newRole === 'team' ? 'Team' : 'Študent';
      // EN: User role was changed to ...
      setMessage(`Rola používateľa bola zmenená na ${roleLabel}`);
      setMessageType('success');
      loadUsers();
    } catch (error) {
      console.error('Error changing role:', error);
      // EN: Error while changing role
      setMessage('Chyba pri zmene roly');
      setMessageType('error');
    }
  };

  if (loading) {
    // EN: Loading...
    return <div className="users-management-container">Načítavam...</div>;
  }

  return (
    <div className="users-management-container">
      <div className="users-management-header">
        <h2>Správa užívateľov {/* EN: User management */}</h2>
        <p>Spravujte používateľov, ich role a prístupy {/* EN: Manage users, their roles, and access */}</p>
      </div>

      {message && (
        <div className={`message message-${messageType}`}>
          {message}
        </div>
      )}

      <div className="users-management-card">
        <h3>Pridať používateľa {/* EN: Add user */}</h3>
        <p className="section-description">
          Toto vytvorí používateľa v kolekcii <b>users</b> vo Firestore. Nevytvára to Firebase Auth účet,
          takže používateľ sa musí najprv zaregistrovať, aby sa mohol prihlásiť. {/* EN: This creates a user in the Firestore users collection. It does not create a Firebase Auth account, so the user must register first before they can sign in. */}
        </p>

        <form onSubmit={handleAddUser} className="add-user-form">
          {/* EN: Name (optional) */}
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="Meno (voliteľné)"
            className="add-user-input"
          />
          {/* EN: Email */}
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="Email"
            className="add-user-input"
            required
          />
          <select
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'team')}
            className="add-user-select"
          >
            <option value="team">Team</option>
            <option value="admin">Administrátor {/* EN: Administrator */}</option>
          </select>
          <button type="submit" className="add-user-btn" disabled={addingUser}>
            {addingUser ? 'Pridávam...' /* EN: Adding... */ : 'Pridať používateľa' /* EN: Add user */}
          </button>
        </form>

        <hr className="users-separator" />

        <h3>Existujúci používatelia {/* EN: Existing users */}</h3>
        {users.length === 0 ? (
          <p className="empty-message">Žiadni užívatelia v systéme {/* EN: No users in the system */}</p>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Meno {/* EN: Name */}</th>
                  <th>Rola {/* EN: Role */}</th>
                  <th>Registrovaný {/* EN: Registered */}</th>
                  <th>Akcia {/* EN: Action */}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="email-cell">{user.email}</td>
                    <td>{user.displayName || '-'}</td>
                    <td>
                      <span className={`role-badge ${user.role}`}>
                        {user.role === 'admin' ? 'Administrátor' /* EN: Administrator */ : user.role === 'team' ? 'Team' : 'Študent' /* EN: Student */}
                      </span>
                    </td>
                    <td>{user.createdAt?.toLocaleDateString('sk-SK') || '-'}</td>
                    <td>
                      <div className="user-actions">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as 'admin' | 'student' | 'team')
                          }
                          className="role-select"
                        >
                          <option value="student">Študent {/* EN: Student */}</option>
                          <option value="team">Team</option>
                          <option value="admin">Administrátor {/* EN: Administrator */}</option>
                        </select>
                        <button
                          className="delete-user-btn"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deletingUserId === user.id}
                        >
                          {deletingUserId === user.id ? 'Mažem...' /* EN: Deleting... */ : 'Vymazať' /* EN: Delete */}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
