import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import '../styles/Login.css';

export const Login = () => {
  const navigate = useNavigate();
  // UI state machine: login/register mode + form fields + request status.
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEmailAllowed = async (userEmail: string): Promise<boolean> => {
    try {
      const normalizedEmail = userEmail.toLowerCase();

      // Admin email bez whitelistu
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase();
      if (normalizedEmail === adminEmail) {
        console.log('Admin email - bypass whitelist');
        return true;
      }

      console.log('Kontrolujem email:', normalizedEmail); // EN: Checking email

      // Access is allowed when email exists in students OR in users.
      const [studentsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('mail', '==', normalizedEmail))),
        getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail))),
      ]);

      const isAllowed = !studentsSnapshot.empty || !usersSnapshot.empty;
      console.log('Whitelist result:', isAllowed ? 'FOUND' : 'EMPTY');
      return isAllowed;
    } catch (error) {
      console.error('Error checking email access:', error);
      return false;
    }
  };

  const normalizeRole = (rawRole: unknown): 'admin' | 'student' | 'team' => {
    const role = String(rawRole ?? '').toLowerCase().trim();
    if (role === 'admin') return 'admin';
    if (role === 'team') return 'team';
    return 'student';
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    // Controlled form submit: preventDefault + explicit loading/error lifecycle.
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Sign-in attempt with email:', email);
      console.log('Sign-in attempt with password:', password ? '****' : '(empty)');

      await signInWithEmailAndPassword(auth, email, password);

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error during email sign-in:', error);
      if (error.code === 'auth/user-not-found') {
        // EN: User not found
        setError('Užívateľ nenájdený');
      } else if (error.code === 'auth/wrong-password') {
        // EN: Wrong password
        setError('Nesprávne heslo');
      } else {
        // EN: Error during sign-in
        setError('Chyba pri prihlásení');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check whitelist before registration
      const allowed = await isEmailAllowed(email);
      
      if (!allowed) {
        // EN: This email does not have access to the app
        setError('Tento email nemá prístup k aplikácii');
        setLoading(false);
        return;
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;

      const normalizedEmail = (user.email ?? email).toLowerCase();

      // If admin pre-created a role by email, keep that role after registration.
      const existingUserQ = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      const existingUserSnap = await getDocs(existingUserQ);

      let roleToSet: 'admin' | 'student' | 'team' = 'student';
      if (!existingUserSnap.empty) {
        existingUserSnap.docs.forEach((d) => {
          const candidateRole = normalizeRole(d.data().role);
          if (candidateRole === 'admin') roleToSet = 'admin';
          else if (candidateRole === 'team' && roleToSet !== 'admin') roleToSet = 'team';
        });
      }

      // Set displayName on Firebase Auth profile
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // Create a new Firestore document with UID
      console.log('Creating new user document with UID:', user.uid);
      // Denormalized profile snapshot: users collection stores data for role/admin views.
      await setDoc(doc(db, 'users', user.uid), {
        email: normalizedEmail,
        displayName: displayName || 'Užívateľ', // EN: User
        photoURL: '',
        role: roleToSet,
        createdAt: new Date(),
      });

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error during registration:', error);
      if (error.code === 'auth/email-already-in-use') {
        // EN: Email already in use
        setError('Email sa už používa');
      } else if (error.code === 'auth/weak-password') {
        // EN: Password must have at least 6 characters
        setError('Heslo musí mať aspoň 6 znakov');
      } else {
        // EN: Error during registration
        setError('Chyba pri registrácii');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-main-title">DASATO Finance System</h1>
        <h2 className="login-sub-title">Prihlásenie {/* EN: Sign in */}</h2>
        
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Prihlásenie {/* EN: Sign in */}
          </button>
          <button
            className={`mode-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Registrácia {/* EN: Registration */}
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleEmailSignIn} className="auth-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
              <input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
              />
              {error && <div className="error-message">{error}</div>}
              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? 'Prihlasuje sa...' /* EN: Signing in... */ : 'Prihlásiť sa' /* EN: Sign in */}
              </button>
            </form>
          </>
        ) : (
          <>
            <form onSubmit={handleEmailRegister} className="auth-form">
              <input
                type="text"
                placeholder="Meno a priezvisko"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-input"
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input"
              />
              <input
                type="password"
                placeholder="Heslo (min. 6 znakov)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input"
              />
              {error && <div className="error-message">{error}</div>}
              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? 'Registruje sa...' /* EN: Registering... */ : 'Registrovať sa' /* EN: Register */}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};