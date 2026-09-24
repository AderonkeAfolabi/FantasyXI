import { create } from "zustand";
import { Player, Position } from "@/types";

export interface LocalSquadPlayer {
  id?: number | string;
  playerId: number;
  player: Player;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  positionOrder: number;
}

interface TeamState {
  squadId: string | null;
  setSquadId: (id: string | null) => void;
  squadName: string;
  setSquadName: (name: string) => void;
  players: LocalSquadPlayer[];
  setPlayers: (players: LocalSquadPlayer[] | ((prev: LocalSquadPlayer[]) => LocalSquadPlayer[])) => void;
  
  selectedPlayerId: number | null;
  setSelectedPlayerId: (id: number | null) => void;
  
  activeModalState: {
    isOpen: boolean;
    requiredPosition: Position | null;
    replacingPlayer: Player | null;
  };
  setActiveModalState: (state: { isOpen: boolean; requiredPosition: Position | null; replacingPlayer: Player | null }) => void;
  
  // Actions
  handleSwap: (playerAId: number, playerBId: number) => void;
  handleSetCaptain: (playerId: number) => void;
  handleSetViceCaptain: (playerId: number) => void;
  handlePlayerClick: (clickedPlayer: Player | null, position?: Position) => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  squadId: null,
  setSquadId: (id) => set({ squadId: id }),
  
  squadName: "My Fantasy XI",
  setSquadName: (name) => set({ squadName: name }),
  
  players: [],
  setPlayers: (updater) => set((state) => ({
    players: typeof updater === 'function' ? updater(state.players) : updater
  })),
  
  selectedPlayerId: null,
  setSelectedPlayerId: (id) => set({ selectedPlayerId: id }),
  
  activeModalState: {
    isOpen: false,
    requiredPosition: null,
    replacingPlayer: null,
  },
  setActiveModalState: (modalState) => set({ activeModalState: modalState }),

  handlePlayerClick: (clickedPlayer, position) => {
    const state = get();
    if (!clickedPlayer) {
      state.setActiveModalState({
        isOpen: true,
        requiredPosition: position || null,
        replacingPlayer: null,
      });
      return;
    }

    if (state.selectedPlayerId && state.selectedPlayerId !== clickedPlayer.id) {
      state.handleSwap(state.selectedPlayerId, clickedPlayer.id);
      state.setSelectedPlayerId(null);
      return;
    }

    state.setSelectedPlayerId(state.selectedPlayerId === clickedPlayer.id ? null : clickedPlayer.id);
  },

  handleSwap: (playerAId, playerBId) => {
    set((state) => {
      const prev = state.players;
      const idxA = prev.findIndex((p) => p.playerId === playerAId);
      const idxB = prev.findIndex((p) => p.playerId === playerBId);
      if (idxA === -1 || idxB === -1) return { players: prev };

      const clone = [...prev];
      const a = { ...clone[idxA] };
      const b = { ...clone[idxB] };

      const tempStarter = a.isStarter;
      const tempOrder = a.positionOrder;

      a.isStarter = b.isStarter;
      a.positionOrder = b.positionOrder;

      b.isStarter = tempStarter;
      b.positionOrder = tempOrder;

      if (!a.isStarter && a.isCaptain) {
        a.isCaptain = false;
        b.isCaptain = true;
      }
      if (!a.isStarter && a.isViceCaptain) {
        a.isViceCaptain = false;
        b.isViceCaptain = true;
      }
      if (!b.isStarter && b.isCaptain) {
        b.isCaptain = false;
        a.isCaptain = true;
      }
      if (!b.isStarter && b.isViceCaptain) {
        b.isViceCaptain = false;
        a.isViceCaptain = true;
      }

      clone[idxA] = a;
      clone[idxB] = b;
      return { players: clone };
    });
  },

  handleSetCaptain: (playerId) => {
    set((state) => ({
      players: state.players.map((p) => ({
        ...p,
        isCaptain: p.playerId === playerId,
        isViceCaptain: p.playerId === playerId ? false : p.isViceCaptain,
      }))
    }));
  },

  handleSetViceCaptain: (playerId) => {
    set((state) => ({
      players: state.players.map((p) => ({
        ...p,
        isViceCaptain: p.playerId === playerId,
        isCaptain: p.playerId === playerId ? false : p.isCaptain,
      }))
    }));
  },
}));
