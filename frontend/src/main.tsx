import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// [ENTRY] Điểm khởi chạy của Frontend (React)
// Tìm thẻ HTML có id="root" và "bơm" toàn bộ ứng dụng React vào đó.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

