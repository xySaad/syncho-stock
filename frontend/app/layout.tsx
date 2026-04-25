import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "Syncho Stock",
  description: "Smart inventory management with AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#161625",
              color: "#EEEEF5",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "13px",
              borderRadius: "8px",
              border: "1px solid #2E2E48",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            },
            success: {
              iconTheme: { primary: "#10B981", secondary: "#EEEEF5" },
            },
            error: { iconTheme: { primary: "#F43F5E", secondary: "#EEEEF5" } },
          }}
        />
      </body>
    </html>
  );
}
