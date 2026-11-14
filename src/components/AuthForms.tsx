"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type AuthState } from "@/app/actions";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
      {error}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ErrorBox error={state?.error} />
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary justify-center">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ErrorBox error={state?.error} />
      <label className="flex flex-col gap-1 text-sm">
        Your name{" "}
        <span className="text-muted">(if you upload songs, this will be your default artist name)</span>
        <input className="input" name="displayName" autoComplete="name" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary justify-center">
        {pending ? "Creating…" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
