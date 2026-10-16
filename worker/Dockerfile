FROM rocker/r-ver:4.5.3

# Every R package comes from this dated Posit Package Manager snapshot, as prebuilt Ubuntu binaries, so rebuilds
#  install the same versions without compiling. It's the snapshot rocker pins for R 4.5.3. To update the packages,
#  change the date, rebuild, and compare a report from before and after.
ENV CRAN=https://p3m.dev/cran/__linux__/noble/2026-04-23
RUN echo "options(repos = c(CRAN = '${CRAN}'))" >> "${R_HOME}/etc/Rprofile.site"

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
RUN R -e "install.packages(c('remotes', 'pkgload')); \
           if (!requireNamespace('remotes', quietly = TRUE) || !requireNamespace('pkgload', quietly = TRUE)) \
             stop('Failed to install remotes and/or pkgload')"

# Install the report package's dependencies before copying the rest of the source, so source edits don't reinstall them
COPY src/scripts/stewardshipReports/DESCRIPTION /app/src/scripts/stewardshipReports/DESCRIPTION
RUN R -e "remotes::install_deps('/app/src/scripts/stewardshipReports', dependencies = TRUE, upgrade = 'never')"

COPY . .

RUN R -e "remotes::install_local('/app/src/scripts/stewardshipReports', dependencies = TRUE, force = TRUE)" \
 && R -e "desc <- read.dcf('/app/src/scripts/stewardshipReports/DESCRIPTION'); \
           imports <- trimws(strsplit(gsub('\n', '', desc[,'Imports']), ',')[[1]]); \
           missing <- imports[!sapply(imports, requireNamespace, quietly = TRUE)]; \
           if (length(missing) > 0) stop('Failed to install: ', paste(missing, collapse=', '))"

CMD [ "npm", "run", "start" ]
