import * as React from "react";

export interface AppRendererProps {
  sandboxProxyUrl: string;
  resourceUri: string;
  resourceText: string;
}

export declare function AppRenderer(props: AppRendererProps): React.ReactElement;
