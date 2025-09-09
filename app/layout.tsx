
export const metadata = {
  title: "B2P Energy · Comparador de Propostas",
  description: "Simulador OMIP para empresas — B2P Energy"
};
import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
