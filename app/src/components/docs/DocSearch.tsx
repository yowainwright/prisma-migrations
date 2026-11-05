import React, { useEffect } from "react";
import docsearch, { type DocSearchProps } from "@docsearch/js";
import "@docsearch/css/dist/style.css";

interface Props {
  algoliaDocsearchConfig: DocSearchProps;
}

function DocSearchReact({ algoliaDocsearchConfig }: Props) {
  useEffect(() => {
    docsearch(algoliaDocsearchConfig);
  }, []);

  return <div id="docsearch"></div>;
}

export default DocSearchReact;
