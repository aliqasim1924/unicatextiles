"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectCoatingReceiving() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/toolbox/finished-fabric/coating/receiving");
  }, [router]);
  return null;
}

