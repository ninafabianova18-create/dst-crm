import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import '../styles/AllowedEmails.css';

interface AllowedEmail {
  id: string;
  email: string;
  addedAt: Date;
}

export const AllowedEmails = () => {
  // Component-level state: list data, form input, and UX feedback states.
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // Mount-time fetch pattern to initialize the table.
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'allowedEmails'));
      const emailsList: AllowedEmail[] = [];
      querySnapshot.forEach((doc) => {
        emailsList.push({
          id: doc.id,
          email: doc.data().email,
          addedAt: doc.data().addedAt?.toDate(),
        });
      });
      setEmails(emailsList.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime()));
    } catch (error) {
      console.error('Chyba pri načítaní emailov:', error);
      setMessage('Chyba pri načítaní emailov');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard clauses: validate input before sending any backend/Firestore request.
    if (!newEmail.trim()) {
      setMessage('Zadajte email');
      setMessageType('error');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setMessage('Neplatný email formát');
      setMessageType('error');
      return;
    }

    // Duplicate check to avoid inserting the same email twice
    if (emails.some((e) => e.email.toLowerCase() === newEmail.toLowerCase())) {
      setMessage('Tento email je už v zozname');
      setMessageType('error');
      return;
    }

    try {
      // Lowercase normalization keeps email comparisons consistent.
      await addDoc(collection(db, 'allowedEmails'), {
        email: newEmail.toLowerCase(),
        addedAt: new Date(),
      });

      setNewEmail('');
      setMessage('Email bol pridaný');
      setMessageType('success');
      loadEmails();
    } catch (error) {
      console.error('Chyba pri pridávaní emailu:', error);
      setMessage('Chyba pri pridávaní emailu');
      setMessageType('error');
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'allowedEmails', id));
      setMessage('Email bol vymazaný');
      setMessageType('success');
      loadEmails();
    } catch (error) {
      console.error('Chyba pri mazaní emailu:', error);
      setMessage('Chyba pri mazaní emailu');
      setMessageType('error');
    }
  };

  if (loading) {
    return <div className="allowed-emails-container">Načítavam...</div>;
  }

  return (
    <div className="allowed-emails-container">
      <div className="allowed-emails-header">
        <h2>Povolené emaily</h2>
        <p>Spravujte zoznam emailov s prístupom k aplikácii</p>
      </div>

      <div className="allowed-emails-card">
        <form onSubmit={handleAddEmail} className="add-email-form">
          <input
            type="email"
            placeholder="Zadajte email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="email-input"
          />
          <button type="submit" className="add-btn">
            Pridať
          </button>
        </form>

        {message && (
          <div className={`message message-${messageType}`}>
            {message}
          </div>
        )}

        <div className="emails-list">
          {emails.length === 0 ? (
            <p className="empty-message">Žiadne emaily v zozname</p>
          ) : (
            <table className="emails-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Pridaný</th>
                  <th>Akcia</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((item) => (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td>{item.addedAt?.toLocaleDateString('sk-SK')}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteEmail(item.id)}
                      >
                        Vymazať
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
