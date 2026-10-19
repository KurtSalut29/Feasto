import type { Metadata } from "next";
import { AuthSwitch } from "../auth-ui";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <>
      <RegisterForm />

      <AuthSwitch question="Already have an account?" href="/login" action="Log in" />
    </>
  );
}
