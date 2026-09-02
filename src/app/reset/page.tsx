import { Logo } from "@/components/logo";
import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="apparait w-full max-w-sm">
        <Logo />
        <p className="mt-6 text-[13px] text-doux">Choisis un nouveau mot de passe.</p>
        <div className="mt-6"><ResetForm /></div>
      </div>
    </main>
  );
}
