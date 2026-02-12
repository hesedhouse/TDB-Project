'use client'

import { useState } from 'react'
import HomeDashboard from '@/components/HomeDashboard'
import EntryGate from '@/components/EntryGate'
import PulseFeed from '@/components/PulseFeed'

export default function Home() {
  const [currentView, setCurrentView] = useState<'home' | 'entry' | 'feed'>('home')
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [userCharacter, setUserCharacter] = useState<number>(0)
  const [userNickname, setUserNickname] = useState<string>('')

  const handleEnterBoard = (boardId: string) => {
    if (!userNickname) {
      setSelectedBoard(boardId)
      setCurrentView('entry')
    } else {
      setSelectedBoard(boardId)
      setCurrentView('feed')
    }
  }

  const handleEntryComplete = (character: number, nickname: string) => {
    setUserCharacter(character)
    setUserNickname(nickname)
    setCurrentView('feed')
  }

  const handleBackToHome = () => {
    setCurrentView('home')
    setSelectedBoard(null)
  }

  return (
    <main className="min-h-screen bg-midnight-black">
      {currentView === 'home' && (
        <HomeDashboard onEnterBoard={handleEnterBoard} />
      )}
      {currentView === 'entry' && selectedBoard && (
        <EntryGate
          boardId={selectedBoard}
          onComplete={handleEntryComplete}
          onClose={() => setCurrentView('home')}
        />
      )}
      {currentView === 'feed' && selectedBoard && (
        <PulseFeed
          boardId={selectedBoard}
          userCharacter={userCharacter}
          userNickname={userNickname}
          onBack={handleBackToHome}
        />
      )}
    </main>
  )
}
