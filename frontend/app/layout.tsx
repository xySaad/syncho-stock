import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Syncho Stock',
  description: 'Smart inventory management with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0D0D0F',
              color: '#F5F2ED',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              borderRadius: '4px',
              border: '1px solid #2a2a2a',
            },
            success: { iconTheme: { primary: '#2A9D5C', secondary: '#F5F2ED' } },
            error: { iconTheme: { primary: '#E84C2E', secondary: '#F5F2ED' } },
          }}
        />
      </body>
    </html>
  )
}
