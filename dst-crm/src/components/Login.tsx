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
      // Admin email bez whitelistu
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase();
      if (userEmail.toLowerCase() === adminEmail) {
        console.log('Admin email - bypass whitelist');
        return true;
      }

      console.log('Kontrolujem email:', userEmail.toLowerCase());
      // "students.mail" is the whitelist source for app access.
      const allowedEmailsRef = collection(db, 'students');

      // Check this specific email against the whitelist source
      const q = query(allowedEmailsRef, where('mail', '==', userEmail.toLowerCase()));
      const querySnapshot = await getDocs(q);
      console.log('Query result:', querySnapshot.empty ? 'EMPTY' : 'FOUND');
      console.log('Number of matching emails:', querySnapshot.size);
      
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking email access:', error);
      return false;
    }
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
        setError('Užívateľ nenájdený');
      } else if (error.code === 'auth/wrong-password') {
        setError('Nesprávne heslo');
      } else {
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
        setError('Tento email nemá prístup k aplikácii');
        setLoading(false);
        return;
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;

      // Set displayName on Firebase Auth profile
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // Create a new Firestore document with UID
      console.log('Creating new user document with UID:', user.uid);
      // Denormalized profile snapshot: users collection stores data for role/admin views.
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: displayName || 'Užívateľ',
        photoURL: '',
        role: 'user',
        createdAt: new Date(),
      });

      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error during registration:', error);
      if (error.code === 'auth/email-already-in-use') {
        setError('Email sa už používa');
      } else if (error.code === 'auth/weak-password') {
        setError('Heslo musí mať aspoň 6 znakov');
      } else {
        setError('Chyba pri registrácii');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Prihlásenie</h1>
        
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Prihlásenie
          </button>
          <button
            className={`mode-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Registrácia
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
                {loading ? 'Prihlasuje sa...' : 'Prihlásiť sa'}
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
                {loading ? 'Registruje sa...' : 'Registrovať sa'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};