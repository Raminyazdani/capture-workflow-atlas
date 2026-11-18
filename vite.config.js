import {defineConfig} from 'vite';
import {fullMapSvg} from './tools/full-map.js';

export default defineConfig({
  plugins:[{
    name:'downloadable-workflow-map',
    configureServer(server){
      server.middlewares.use('/full-workflow.svg',(_req,res)=>{
        res.setHeader('Content-Type','image/svg+xml; charset=utf-8');
        res.end(fullMapSvg());
      });
    },
    generateBundle(){this.emitFile({type:'asset',fileName:'full-workflow.svg',source:fullMapSvg()});},
  }],
});
