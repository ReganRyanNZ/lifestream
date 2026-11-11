import { RegisterForm } from "@/components/AuthForms";

export const metadata = { title: "Join" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Join Life Stream</h1>
        <p className="mt-1 text-sm text-muted">
          Listening needs no account — join to like, playlist, and share your own music.
        </p>
      </div>
      <div className="card p-5">
        <RegisterForm />
      </div>
    </div>
  );
}
