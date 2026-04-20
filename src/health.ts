export function handleHealth(): Response {
	return new Response(JSON.stringify({ status: 'ok', service: 'mushin' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
