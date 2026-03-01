import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './components/Login'
import { Dashboard } from './components/Dashboard'
import { Unauthorized } from './components/Unauthorized'



function App() {
  return (
    // BrowserRouter provides client-side routing without full page refreshes.
    <BrowserRouter>
      {/* AuthProvider shares authenticated user/role through React Context across the app. */}
      <AuthProvider>
        {/* Routes + Route is declarative routing: each path maps to a specific component. */}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          
        
        
          <Route
            path="/dashboard"
            element={
              // ProtectedRoute uses the guard pattern: it decides if the dashboard can render.
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          
          {/* Redirect to dashboard when authenticated, otherwise to login */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
