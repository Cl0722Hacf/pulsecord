export interface Person {
  id: string
  name: string
  color: string
  avatar: string
  mic: boolean
  deaf: boolean
  vroom: string
  voice?: MediaStream
  cam?: MediaStream
  screen?: MediaStream
  local?: boolean
  demo?: boolean
}
export interface Msg { id: string; ch: string; from: string; name: string; color: string; avatar: string; text: string; img?: string; ts: number }
export interface Profile { name: string; color: string; avatar: string }
export type Kind = 'voice' | 'cam' | 'screen'
