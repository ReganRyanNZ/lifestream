import { LoginForm } from "@/components/AuthForms";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
      </div>
      <div className="card p-5">
        <LoginForm />
      </div>
    </div>
  );
}
