export type CachedTrain = {
  dest: string
  time: string
  plat?: string
  route?: string
}

export type CachedStation = {
  currTime: string | null
  delay: boolean
  up: CachedTrain[]
  down: CachedTrain[]
}

export type TrainSnapshot = {
  fetchedAt: number
  stations: Record<string, CachedStation>
}
