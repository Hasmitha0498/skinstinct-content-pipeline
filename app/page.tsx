// Minimal status page. Telegram is the product interface; this only confirms the deployment is live.
export default function Home() {
  return (
    <main>
      <h1>Skinstinct content pipeline</h1>
      <p>This service is running. It has no web interface: notes are sent to the Telegram bot.</p>
      <p>Drafts are only ever saved for review. Nothing is published to LinkedIn automatically.</p>
      <p>
        Health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
