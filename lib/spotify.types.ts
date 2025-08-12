export type SpotifyTokenResponse = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  refresh_token?: string
  scope?: string
}

export type SpotifyDevice = {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number | null
}
