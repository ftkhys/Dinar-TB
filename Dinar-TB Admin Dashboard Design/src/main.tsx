import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StaffAuthProvider } from './auth/staff-auth-context'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StaffAuthProvider>
      <App />
    </StaffAuthProvider>
  </React.StrictMode>,
)
