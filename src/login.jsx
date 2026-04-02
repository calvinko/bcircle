import React from "react";
import { User } from "lucide-react";

export default function LoginCard({
  Card,
  CardHeader,
  CardContent,
  TabButton,
  TextInput,
  PrimaryButton,
  authToken,
  authMode,
  setAuthMode,
  handleAuthSubmit,
  authForm,
  handleAuthFieldChange,
  authSubmitting,
  authError,
  currentUser,
  profileEmail,
  handleSignOut,
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <User className="h-5 w-5" />
          Account
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!authToken ? (
          <>
            <div className="flex gap-2 rounded-3xl bg-slate-100 p-1">
              <TabButton active={authMode === "signin"} onClick={() => setAuthMode("signin")}>
                Sign in
              </TabButton>
              <TabButton active={authMode === "register"} onClick={() => setAuthMode("register")}>
                Register
              </TabButton>
            </div>

            <form onSubmit={handleAuthSubmit} className="grid gap-4 lg:grid-cols-2">
              {authMode === "register" ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Display name</p>
                  <TextInput
                    value={authForm.displayName}
                    onChange={(e) => handleAuthFieldChange("displayName", e.target.value)}
                    placeholder="Bible Reader"
                  />
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Email</p>
                <TextInput
                  type="email"
                  value={authForm.email}
                  onChange={(e) => handleAuthFieldChange("email", e.target.value)}
                  placeholder="reader@example.com"
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Password</p>
                <TextInput
                  type="password"
                  value={authForm.password}
                  onChange={(e) => handleAuthFieldChange("password", e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="flex items-end">
                <PrimaryButton type="submit" className="w-full" disabled={authSubmitting}>
                  {authSubmitting
                    ? authMode === "register"
                      ? "Creating account..."
                      : "Signing in..."
                    : authMode === "register"
                      ? "Create account"
                      : "Sign in"}
                </PrimaryButton>
              </div>
            </form>

            {authError ? <div className="text-sm text-red-600">{authError}</div> : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Sign in to keep your reading progress, plan, and profile separate for each user.
            </div>
          </>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">Signed in as</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {currentUser?.email || profileEmail}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Your reading data now syncs per account.
              </div>
            </div>
            <div className="flex items-end">
              <PrimaryButton
                variant="outline"
                className="w-full lg:w-auto"
                onClick={handleSignOut}
              >
                Sign out
              </PrimaryButton>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
