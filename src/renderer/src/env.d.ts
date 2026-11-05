/// <reference types="vite/client" />

import type { GameAPI } from '../../preload/index'

declare global {
  interface Window {
    gameAPI: GameAPI
  }
}

export {}
