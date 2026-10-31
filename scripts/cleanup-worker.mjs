const worker = {
  async scheduled(_event, env) {
    const response = await fetch(env.CLEANUP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CLEANUP_SECRET}` },
    })
    if (!response.ok)
      throw new Error(`Cleanup failed with status ${response.status}`)
  },
}

export default worker
