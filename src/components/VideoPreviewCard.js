import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

export default function VideoPreviewCard({ uri, label = '视频动态', style, showFloatingButton = true }) {
  const [playing, setPlaying] = useState(false);
  const [activated, setActivated] = useState(false);
  const [pendingAutoPlay, setPendingAutoPlay] = useState(false);

  const player = useVideoPlayer(activated ? uri : null, playerInstance => {
    playerInstance.loop = false;
    playerInstance.muted = true;
    playerInstance.pause();
  });

  const togglePlay = () => {
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
      } else {
        if (!activated) {
          setActivated(true);
          setPendingAutoPlay(true);
          return;
        }
        player.muted = false;
        player.play();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  useEffect(() => {
    if (!activated || !pendingAutoPlay) return;
    try {
      player.muted = false;
      player.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    } finally {
      setPendingAutoPlay(false);
    }
  }, [activated, pendingAutoPlay, player]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.replace(null);
      } catch (e) {
        // ignore cleanup errors
      }
    };
  }, [player]);

  return (
    <View style={[styles.container, style]}>
      {activated ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFillObject}
          nativeControls={false}
          contentFit="cover"
          surfaceType="textureView"
        />
      ) : null}
      <View style={[styles.overlay, playing && styles.overlayPlaying]} pointerEvents="none">
        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={42} color="#fff" />
        <Text style={styles.label}>{label}</Text>
      </View>
      <TouchableOpacity style={styles.centerHotArea} onPress={togglePlay} />
      {showFloatingButton ? (
        <TouchableOpacity style={styles.playHotArea} onPress={togglePlay}>
          <View style={styles.playButton}>
            <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#fff" />
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  overlayPlaying: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  playHotArea: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  centerHotArea: {
    ...StyleSheet.absoluteFillObject,
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});