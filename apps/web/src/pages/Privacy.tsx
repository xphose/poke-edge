export function PrivacyPage() {
  return (
    <div className="prose prose-sm mx-auto max-w-3xl dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground"><em>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>

      <h2>1. Information We Collect</h2>
      <p>When you create an account, we collect your username, email address, and a securely hashed password. We do not store your plaintext password.</p>
      <p>We automatically collect basic usage data (pages visited, features used) to improve the service. We do not sell your personal data to third parties.</p>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide and maintain the PokeGrails service</li>
        <li>To authenticate your account and manage sessions</li>
        <li>To send service-related notifications (price alerts, account updates)</li>
        <li>To improve our analytics models and user experience</li>
      </ul>

      <h2>3. Data Storage & Security</h2>
      <p>Your data is stored on secure servers with encrypted connections. Passwords are hashed using bcrypt with a cost factor of 12. Authentication uses short-lived JWT tokens with refresh token rotation.</p>

      <h2>4. Cookies</h2>
      <p>We use localStorage (not traditional cookies) to store your authentication tokens and UI preferences (theme, column visibility). No third-party tracking cookies are used.</p>

      <h2>5. Data Retention</h2>
      <p>Account data is retained while your account is active. You may request deletion of your account and associated data by contacting us.</p>

      <h2>6. Third-Party Services</h2>
      <p>We integrate with PokemonTCG.io, PriceCharting, and payment processors (Stripe) to provide our services. These services have their own privacy policies.</p>

      <h2>7. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal data. Contact us at <a href="mailto:privacy@pokegrails.com">privacy@pokegrails.com</a>.</p>

      <h2>8. Changes</h2>
      <p>We may update this policy. Significant changes will be communicated through the application.</p>
    </div>
  )
}
