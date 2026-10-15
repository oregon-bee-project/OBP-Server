FROM rocker/r-ver:4.5

RUN apt-get update && apt-get install -y --no-install-recommends  \
    curl \
    pandoc \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    libudunits2-dev \
    libssl-dev \
    libcurl4-openssl-dev \
    libxml2-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    libuv1-dev \
    libglpk-dev \
    libgmp3-dev \
    libmagick++-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    lmodern \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN R -e "install.packages(c('remotes', 'devtools'), repos='https://cloud.r-project.org'); \
           if (!requireNamespace('remotes', quietly = TRUE) || !requireNamespace('devtools', quietly = TRUE)) \
             stop('Failed to install remotes and/or devtools')"

COPY . .

RUN R -e "remotes::install_deps('/app/src/scripts/stewardshipReports', dependencies = TRUE, upgrade = 'never')" \
 && R -e "remotes::install_local('/app/src/scripts/stewardshipReports', dependencies = TRUE, force = TRUE)" \
 && R -e "desc <- read.dcf('/app/src/scripts/stewardshipReports/DESCRIPTION'); \
           imports <- trimws(strsplit(gsub('\n', '', desc[,'Imports']), ',')[[1]]); \
           missing <- imports[!sapply(imports, requireNamespace, quietly = TRUE)]; \
           if (length(missing) > 0) stop('Failed to install: ', paste(missing, collapse=', '))"



CMD [ "npm", "run", "start" ]
