import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import '../styles/ImportStudents.css';



interface StudentRecord {
  name: string;
  surname: string;
  region: string;
  school: string;
  mail: string;
  telephoneNumber: string;
  typeOfPayment: string;
  period: string;
  amount: string;
  iban: string;
  note: string;
  vs: string;
}
interface PaymentInfo {
  vs:string;
  amount: string;
  date:Date;
  message:string;
  senderIban:string;
  senderName:string
}


export const ImportStudents = () => {
  // Two parallel import workflows: students and payments, each with separate form/feedback state.
  const [file, setFile] = useState<File | null>(null);
  const [filePayments, setFilePayments ] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingPayments, setImportingPayments  ] = useState(false);
  const [message, setMessage] = useState('');
  const [messagePayments, setMessagePayments] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [messageTypePayments, setMessageTypePayments] = useState<'successPayments' | 'errorPayments'>('successPayments');
  

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      //console.log("Selected students JSON file:", e.target.files[0].name);
      setFile(e.target.files[0]);
      setMessage('');
    }
    //console.log("Students file after change:", file);
  };

  const handleFilePaymentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      //console.log("Selected payments JSON file:", e.target.files[0].name);
      setFilePayments(e.target.files[0]);
      setMessagePayments('');
    }
    //console.log("Payments file after change:", file);
  };



  const handleImport = async () => {
    // Guard clause pattern: exit early when input is invalid.
    if (!file) {
      setMessage('Vyberte JSON súbor');
      setMessageType('error');
      return;
    }

    setImporting(true);
    try {
      // Browser File API -> text -> JSON parse (batch import from local file).
      const text = await file.text();
      console.log(text);
      const students: StudentRecord[] = JSON.parse(text);
console.log("1");
      if (!Array.isArray(students)) {
        throw new Error('JSON musí obsahovať pole študentov');
      }
      console.log("2");

      let successCount = 0;
      let errorCount = 0;

      for (const student of students) {
        try {
          // Validate required fields
          if (!student.mail || !student.name || !student.surname) {
            errorCount++;
            continue;
          }

          // Write-per-record pattern: each student is stored as a separate Firestore document.
          await addDoc(collection(db, 'students'), {
            name: student.name || '',
            surname: student.surname || '',
            region: student.region || '',
            school: student.school || '',
            mail: student.mail || '',
            telephoneNumber: student.telephoneNumber || '',
            typeOfPayment: student.typeOfPayment || '',
            period: student.period || '',
            amount: student.amount || '',
            iban: student.iban || '',
            note: student.note || '',
            vs: student.vs || '',
            importedAt: new Date(),
          });

          successCount++;
        } catch (error) {
          console.error('Chyba pri importovaní študenta:', student.mail, error);
          errorCount++;
        }
      }

      setMessage(`Úspešne importovaných: ${successCount}, Chyby: ${errorCount}`);
      setMessageType('success');
      setFile(null);
      (document.getElementById('file-input') as HTMLInputElement).value = '';
    } catch (error) {
      console.error('Chyba pri parsovaní JSON:', error);
      setMessage('Chyba pri čítaní JSON súboru. Skontrolujte formát.');
      setMessageType('error');
    } finally {
      setImporting(false);
    }
  };

    const handleImportPayments = async () => {

      if (!filePayments) {
      setMessage('Vyberte JSON súbor');
      setMessageType('error');
      return;
    }

    setImportingPayments(true);

    try {
      // Same import pipeline for payments collection, separated because schema differs.
      const text = await filePayments.text();
      const payments: PaymentInfo[] = JSON.parse(text);

      if (!Array.isArray(payments)) {
        throw new Error('JSON musí obsahovať pole platieb');
      }

      let successCount = 0;
      let errorCount = 0;

      for (const payment of payments) {
        try {
          

          // Payments are intentionally not matched here; matching is handled in PaymentsManagement.
          await addDoc(collection(db, 'payments'), {
            date: payment.date,
            amount: payment.amount,
            senderIban: payment.senderIban || '',
            senderName: payment.senderName || '',
            vs: payment.vs || '',
            message: payment.message || '',
          });

          successCount++;
        } catch (error) {
            console.error('Chyba pri importovaní platby:', payment.vs, error);
          errorCount++;
        }
      }

      setMessagePayments(`Úspešne importovaných: ${successCount}, Chyby: ${errorCount}`);
      setMessageTypePayments('successPayments');
      setFilePayments(null);
      (document.getElementById('file-input-payments') as HTMLInputElement).value = '';
    } catch (error) {
        console.error('Chyba pri parsovaní JSON:', error);
        setMessagePayments('Chyba pri čítaní JSON súboru. Skontrolujte formát.');
        setMessageTypePayments('errorPayments');
    } finally {
        setImportingPayments(false);
    }
  };

  return (
    <div className="import-students-container">
     
      <div className="import-header">
        <h2>Import</h2>
        <p>Nahrajte JSON súbor </p>
      </div>
      

      <div className="import-grid">

        <div className="import-card">

          <div className="file-input-wrapper">
            <label htmlFor="file-input" className="file-input-label">
                JSON súbor študentov:
            </label>
        
            <input
              id="file-input"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="file-input"
              />
            
            <span className="file-name">{file?.name || 'Žiadny súbor nie je vybraný'}</span>
            
            </div>

            <div className="format-info">
              <h3>Formát JSON súboru:</h3>
              <pre>{`[
                      {
    "name": "Meno",
    "surname": "Priezvisko",
    "region": "Región",
    "school": "Škola",
    "mail": "email@example.com",
    "telephoneNumber": "+421950123456",
    "typeOfPayment": "Classis",
    "period": "Year",
    "amount": "360",
    "iban": "SK1234567890",
    "vs": "123456",
    "note": "Poznámka"
                      }
                    ]`}</pre>
            </div>

            <button
              className="import-btn"
              onClick={handleImport}
              disabled={!file || importing}
            >
              {importing ? 'Importujem...' : 'Importovať'}
            </button>

            {message && (
              <div className={`message message-${messageType}`}>
                {message}
              </div>
            )}
          </div>

        

          <div className="import-card">
            <div className="file-input-wrapper">
              <label htmlFor="file-input-payments" className="file-input-label">
                JSON súbor platieb:
              </label>
              <input
                id="file-input-payments"
                type="file"
                accept=".json"
                onChange={handleFilePaymentsChange}
                className="file-input"
              />
              <span className="file-name">{filePayments?.name || 'Žiadny súbor nie je vybraný'}</span>
            </div>

            <div className="format-info">
              <h3>Formát JSON súboru:</h3>
              <pre>{`[
                      {
      "date": "Dátum platby",
      "amount": "suma",
      "senderIban": "číslo účtu",
      "message": "popis platby",
      "senderName": "meno odosielateľa",
      "vs": "variabilný symbol"
      },

                    ]`}</pre>
            </div>

            <button
              className="import-btn"
              onClick={handleImportPayments}
              disabled={!filePayments || importingPayments}
            >
              {importingPayments ? 'Importujem...' : 'Importovať'}
            </button>

            {messagePayments && (
              <div className={`message message-${messageTypePayments}`}>
                {messagePayments}
              </div>
            )}
          </div>
      </div>
    </div>

    
  );
};
