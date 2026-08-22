import ClientNavbar from "./ClientNavbar.jsx";

export default function ClientLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#f7f8f9]">
      <ClientNavbar />
      {children}
      <footer className="mt-12 border-t border-slate-200 bg-white px-6 py-7 text-center text-xs text-slate-500">
        FERRETERIA FYF · Catálogo informativo
      </footer>
    </div>
  );
}
