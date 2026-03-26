import { useRef, useCallback } from 'react';
import type { OrbitControls } from '@react-three/drei';
import type { ElementRef, RefObject } from 'react';

type ControlsInstance = ElementRef<typeof OrbitControls> | null;

interface SyncedCamera {
  leftRef: RefObject<ControlsInstance>;
  rightRef: RefObject<ControlsInstance>;
  syncFrom: (source: 'left' | 'right') => void;
}

export function useSyncedCamera(): SyncedCamera {
  const leftRef = useRef<ControlsInstance>(null);
  const rightRef = useRef<ControlsInstance>(null);
  const isSyncing = useRef(false);

  const syncFrom = useCallback((source: 'left' | 'right') => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    const src = source === 'left' ? leftRef.current : rightRef.current;
    const dst = source === 'left' ? rightRef.current : leftRef.current;

    if (src && dst && 'object' in src && 'object' in dst) {
      const srcCam = (src as any).object;
      const dstCam = (dst as any).object;
      if (srcCam && dstCam) {
        dstCam.position.copy(srcCam.position);
        dstCam.quaternion.copy(srcCam.quaternion);
        dstCam.zoom = srcCam.zoom;
        dstCam.updateProjectionMatrix();
        (dst as any).update?.();
      }
    }

    isSyncing.current = false;
  }, []);

  return { leftRef, rightRef, syncFrom };
}
