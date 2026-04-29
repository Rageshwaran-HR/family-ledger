import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";

export function useFamilyData<T = any>(table: string, deps: any[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(table as any).select("*").order("created_at", { ascending: false });
    if (!error) setData((data as T[]) ?? []);
    setLoading(false);
  }, [table]);
  useEffect(() => { refetch(); /* eslint-disable-next-line */ }, deps);
  return { data, loading, refetch };
}
