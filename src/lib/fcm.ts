export async function sendFCM({
  title,
  body,
  topic,
}: {
  title: string;
  body: string;
  topic: string;
}) {
  if (!process.env.FCM_SERVER_KEY) return;
  await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${process.env.FCM_SERVER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notification: { title, body },
      to: `/topics/${topic}`,
    }),
  });
}
